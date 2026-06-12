"""Franchise development module - scrape facts, manage profile, generate pages."""
from __future__ import annotations
import asyncio
import logging
import threading
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator

from app.auth import require_auth
from app.db import get_db
from app.services.franchise import (
    PAGE_TYPES, build_franchise_user_prompt, build_franchise_user_prompt_from_plan,
    extract_fact_sheet, gather_competitor_context, render_pop_term_guidance,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["franchise"])

_scrape_jobs: dict[str, dict[str, Any]] = {}
_plan_jobs: dict[str, dict[str, Any]] = {}
_JOB_TTL_SECONDS = 30 * 60


def _evict_stale_jobs(store: dict[str, dict[str, Any]]) -> None:
    cutoff = time.time() - _JOB_TTL_SECONDS
    for key in [k for k, v in store.items() if v.get("_created", 0) < cutoff]:
        store.pop(key, None)


class ScrapeRequest(BaseModel):
    brand_id: str = Field(max_length=100)
    urls: list[str] = Field(default=[], max_length=10)
    main_url: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _require_exactly_one_input(self) -> "ScrapeRequest":
        has_urls = bool(self.urls)
        has_main = bool(self.main_url)
        if has_urls and has_main:
            raise ValueError("Provide either 'urls' or 'main_url', not both.")
        if not has_urls and not has_main:
            raise ValueError("Provide either 'urls' (list) or 'main_url' (string).")
        return self


class ProfileUpdate(BaseModel):
    franchise_profile: dict


class PlanRequest(BaseModel):
    brand_id: str = Field(max_length=100)
    site_urls: list[str] = Field(default=[], max_length=5)
    main_url: str | None = Field(default=None, max_length=2000)
    seed_keywords: list[str] = Field(default=[], max_length=20)

    @model_validator(mode="after")
    def _require_exactly_one_input(self) -> "PlanRequest":
        has_urls = bool(self.site_urls)
        has_main = bool(self.main_url)
        if has_urls and has_main:
            raise ValueError("Provide either 'site_urls' or 'main_url', not both.")
        if not has_urls and not has_main:
            raise ValueError("Provide either 'site_urls' (list) or 'main_url' (string).")
        return self


class PlanUpdate(BaseModel):
    franchise_content_plan: dict


class FranchiseGenerateRequest(BaseModel):
    brand_id: str = Field(max_length=100)
    page_type: str = Field(default="", max_length=50)
    plan_page_id: str | None = None
    pop_boost: bool = False


def _run_scrape_job(job_id: str, urls: list[str], main_url: str | None = None):
    loop = asyncio.new_event_loop()
    try:
        from app.services.scraper import scrape_url, map_site
        from app.services.franchise import select_relevant_urls

        async def run():
            # Discovery path: map the site then let Claude select pages
            if main_url:
                try:
                    logger.info("Scrape job %s: mapping site %s", job_id, main_url)
                    mapped = await map_site(main_url)
                    # Ensure main_url is in the list for selection
                    if main_url not in mapped:
                        mapped = [main_url] + mapped
                    logger.info("Scrape job %s: map returned %d URLs", job_id, len(mapped))
                    selected = await select_relevant_urls(mapped, "fact_sheet", main_url=main_url)
                    logger.info("Scrape job %s: selected %d URLs", job_id, len(selected))
                except Exception as e:
                    raise RuntimeError(f"Failed while discovering pages: {e}") from e
                scrape_urls = selected
            else:
                scrape_urls = urls

            results, errors = [], []
            for u in scrape_urls:
                try:
                    page = await scrape_url(u)
                    page["url"] = u
                    if not (page.get("content") or "").strip():
                        reason = page.get("error") or (
                            "scraper returned error source" if page.get("source") == "error"
                            else "scrape returned no content"
                        )
                        errors.append(f"{u}: {reason}")
                        continue
                    results.append(page)
                except Exception as e:
                    errors.append(f"{u}: {e}")
            if not results:
                raise RuntimeError("All scrapes failed: " + "; ".join(errors))
            sheet = await extract_fact_sheet(results)
            # Store the URLs actually scraped successfully
            sheet["source_urls"] = [r["url"] for r in results]
            sheet["scraped_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            return sheet, errors

        sheet, errors = loop.run_until_complete(run())
        _scrape_jobs[job_id] = {
            "status": "done", "fact_sheet": sheet, "scrape_errors": errors,
            "_created": time.time(),
        }
    except Exception as e:
        logger.exception("Franchise scrape job %s failed", job_id)
        _scrape_jobs[job_id] = {"status": "error", "error": str(e), "_created": time.time()}
    finally:
        loop.close()


def _run_plan_job(
    job_id: str,
    brand: dict,
    fact_sheet: dict,
    site_urls: list[str],
    seed_keywords: list[str],
    main_url: str | None = None,
):
    loop = asyncio.new_event_loop()
    last_stage: list[str] = ["Starting"]

    def set_stage(label: str) -> None:
        last_stage[0] = label
        job = _plan_jobs.get(job_id)
        if job is not None:  # guard against TTL eviction mid-run
            job["stage"] = label

    try:
        from app.services.franchise_plan import build_content_plan
        from app.services.scraper import map_site
        from app.services.franchise import select_relevant_urls

        async def run():
            resolved_urls = site_urls
            if main_url:
                set_stage("Discovering pages")
                logger.info("Plan job %s: mapping site %s", job_id, main_url)
                mapped = await map_site(main_url)
                if main_url not in mapped:
                    mapped = [main_url] + mapped
                logger.info("Plan job %s: map returned %d URLs", job_id, len(mapped))
                resolved_urls = await select_relevant_urls(
                    mapped, "plan_profile", main_url=main_url
                )
                logger.info("Plan job %s: selected %d URLs", job_id, len(resolved_urls))
            return await build_content_plan(
                brand, fact_sheet, resolved_urls, seed_keywords, set_stage
            )

        plan = loop.run_until_complete(run())
        _plan_jobs[job_id] = {
            "status": "done",
            "plan": plan,
            "_created": time.time(),
        }
    except Exception as e:
        logger.exception("Franchise plan job %s failed", job_id)
        stage_lower = last_stage[0].lower()
        _plan_jobs[job_id] = {
            "status": "error",
            "error": f"Failed while {stage_lower}: {e}",
            "_created": time.time(),
        }
    finally:
        loop.close()


@router.post("/api/franchise/scrape")
def start_scrape(req: ScrapeRequest, _auth: dict = Depends(require_auth)):
    _evict_stale_jobs(_scrape_jobs)
    job_id = str(uuid.uuid4())
    _scrape_jobs[job_id] = {"status": "pending", "_created": time.time()}
    threading.Thread(
        target=_run_scrape_job,
        args=(job_id, req.urls, req.main_url),
        daemon=True,
    ).start()
    return {"job_id": job_id, "status": "pending"}


@router.get("/api/franchise/scrape/status/{job_id}")
def scrape_status(job_id: str, _auth: dict = Depends(require_auth)):
    _evict_stale_jobs(_scrape_jobs)
    job = _scrape_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found. The server may have restarted. Please retry.")
    if job["status"] == "error":
        _scrape_jobs.pop(job_id, None)
        raise HTTPException(500, job["error"])
    if job["status"] == "done":
        _scrape_jobs.pop(job_id, None)
        return {"status": "done", "fact_sheet": job["fact_sheet"], "scrape_errors": job["scrape_errors"]}
    return {"status": "pending"}


@router.get("/api/franchise/profile/{brand_id}")
def get_profile(brand_id: str, _auth: dict = Depends(require_auth)):
    try:
        res = get_db().table("brands").select("id,name,franchise_profile").eq("id", brand_id).limit(1).execute()
    except Exception:
        raise HTTPException(503, "Database error")
    if not res.data:
        raise HTTPException(404, "Brand not found")
    return res.data[0]


@router.put("/api/franchise/profile/{brand_id}")
def save_profile(brand_id: str, body: ProfileUpdate, _auth: dict = Depends(require_auth)):
    try:
        res = get_db().table("brands").update(
            {"franchise_profile": body.franchise_profile}
        ).eq("id", brand_id).execute()
    except Exception:
        raise HTTPException(503, "Database error")
    if not res.data:
        raise HTTPException(404, "Brand not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Plan endpoints — CRITICAL: status/{job_id} MUST be declared before {brand_id}
# so FastAPI does not match the literal string "status" as a brand_id.
# ---------------------------------------------------------------------------

@router.post("/api/franchise/plan")
def start_plan(req: PlanRequest, _auth: dict = Depends(require_auth)):
    _evict_stale_jobs(_plan_jobs)
    try:
        res = get_db().table("brands").select("*").eq("id", req.brand_id).limit(1).execute()
    except Exception:
        raise HTTPException(503, "Database error")
    if not res.data:
        raise HTTPException(404, "Brand not found")
    brand = res.data[0]
    fact_sheet = brand.get("franchise_profile")
    if not fact_sheet:
        raise HTTPException(400, "No franchise fact sheet for this brand. Scrape or fill one in first.")
    job_id = str(uuid.uuid4())
    _plan_jobs[job_id] = {"status": "pending", "stage": "Starting", "_created": time.time()}
    threading.Thread(
        target=_run_plan_job,
        args=(job_id, brand, fact_sheet, req.site_urls, req.seed_keywords, req.main_url),
        daemon=True,
    ).start()
    return {"job_id": job_id, "status": "pending"}


@router.get("/api/franchise/plan/status/{job_id}")
def plan_status(job_id: str, _auth: dict = Depends(require_auth)):
    _evict_stale_jobs(_plan_jobs)
    job = _plan_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found. The server may have restarted. Please retry.")
    if job["status"] == "error":
        msg = job["error"]
        _plan_jobs.pop(job_id, None)
        raise HTTPException(500, msg)
    if job["status"] == "done":
        plan = job["plan"]
        _plan_jobs.pop(job_id, None)
        return {"status": "done", "plan": plan}
    return {"status": "pending", "stage": job.get("stage", "Starting")}


@router.get("/api/franchise/plan/{brand_id}")
def get_plan(brand_id: str, _auth: dict = Depends(require_auth)):
    try:
        res = get_db().table("brands").select("id,name,franchise_content_plan").eq("id", brand_id).limit(1).execute()
    except Exception:
        raise HTTPException(503, "Database error")
    if not res.data:
        raise HTTPException(404, "Brand not found")
    return res.data[0]


@router.put("/api/franchise/plan/{brand_id}")
def save_plan(brand_id: str, body: PlanUpdate, _auth: dict = Depends(require_auth)):
    try:
        res = get_db().table("brands").update(
            {"franchise_content_plan": body.franchise_content_plan}
        ).eq("id", brand_id).execute()
    except Exception:
        raise HTTPException(503, "Database error")
    if not res.data:
        raise HTTPException(404, "Brand not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Generate
# ---------------------------------------------------------------------------

@router.post("/api/franchise/generate")
async def generate_page(req: FranchiseGenerateRequest, _auth: dict = Depends(require_auth)):
    # Validate page_type only when not using a plan entry
    if req.plan_page_id is None and req.page_type not in PAGE_TYPES:
        raise HTTPException(400, f"Unknown page_type. Valid: {list(PAGE_TYPES)}")

    try:
        res = get_db().table("brands").select("*").eq("id", req.brand_id).limit(1).execute()
    except Exception:
        raise HTTPException(503, "Database error")
    if not res.data:
        raise HTTPException(404, "Brand not found")
    brand = res.data[0]
    sheet = brand.get("franchise_profile")
    if not sheet:
        raise HTTPException(400, "No franchise fact sheet for this brand. Scrape or fill one in first.")

    # Build user prompt — two paths, single streaming block
    if req.plan_page_id is not None:
        plan = brand.get("franchise_content_plan")
        if not plan:
            raise HTTPException(400, "No saved content plan for this brand.")
        pages = plan.get("pages") or []
        page_entry = next((p for p in pages if p.get("id") == req.plan_page_id), None)
        if page_entry is None:
            raise HTTPException(400, f"Plan page {req.plan_page_id} not found.")

        # --- Competitor grounding pre-work ---
        kws = page_entry.get("target_keywords") or []
        top_keyword = kws[0].get("kw") if kws else None

        competitor_context: str | None = None
        if top_keyword:
            competitor_context = await gather_competitor_context(top_keyword)

        pop_guidance: str | None = None
        if req.pop_boost and top_keyword:
            try:
                from app.services.pop import get_enriched_brief
                brief = await get_enriched_brief(keyword=top_keyword)
                pop_guidance = render_pop_term_guidance(brief)
            except Exception as exc:
                logger.warning(
                    "POP boost failed for keyword %r (non-blocking): %s", top_keyword, exc
                )

        user = build_franchise_user_prompt_from_plan(
            page_entry, brand.get("name", ""), sheet,
            competitor_context=competitor_context,
            pop_guidance=pop_guidance,
        )
    else:
        user = build_franchise_user_prompt(req.page_type, brand.get("name", ""), sheet)

    from app.services.claude import stream_claude, get_generation_model
    from app.services.content_generator import build_system_prompt, with_role_block

    system_blocks = build_system_prompt(
        voice_dimensions=brand.get("voice_dimensions"),
        voice_notes=brand.get("voice_notes"),
        brand_banned_words=brand.get("brand_banned_words"),
        brand_guidelines=brand.get("brand_guidelines"),
        brand_competitors=brand.get("competitors") or [],
        prompt_learnings=brand.get("prompt_learnings"),
    )
    system = with_role_block(
        system_blocks,
        (
            "You write franchise development (franchisee recruitment) pages for "
            "prospective franchisees.\n\n"
            "STYLE AND DISCIPLINE RULES FOR THESE PAGES:\n"
            "- NEVER fabricate hyperlinks or placeholder links like [page](#). If a "
            "related page is worth mentioning, name it in plain text only.\n"
            "- Banned construction: a claim followed by a portentous one-liner like "
            "'That kind of X is not common.', 'That level of X is rare.', or 'X is one "
            "of the most underrated Y.' Use it zero times. Make the claim carry its own "
            "weight with specifics instead.\n"
            "- Vary section shapes: some sections short and punchy, some with lists, "
            "some narrative. If two consecutive sections have the same structure, "
            "rework one.\n"
            "- No throat-clearing intros ('In this guide we will cover...'). Open with "
            "the single most compelling specific fact you have.\n"
            "- Industry-level claims (market size, recession resilience, growth trends) "
            "may ONLY appear if they are present in the provided fact sheet, research, "
            "or competitor context. Never supply them from memory.\n"
            "- One closing call to action, two sentences max, no boilerplate urgency."
        ),
    )

    return StreamingResponse(
        stream_claude(system, user, model=get_generation_model()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
