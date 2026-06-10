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
from pydantic import BaseModel, Field

from app.auth import require_auth
from app.db import get_db
from app.services.franchise import (
    PAGE_TYPES, build_franchise_user_prompt, extract_fact_sheet,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["franchise"])

_scrape_jobs: dict[str, dict[str, Any]] = {}
_JOB_TTL_SECONDS = 30 * 60


def _evict_stale_jobs() -> None:
    cutoff = time.time() - _JOB_TTL_SECONDS
    for key in [k for k, v in _scrape_jobs.items() if v.get("_created", 0) < cutoff]:
        _scrape_jobs.pop(key, None)


class ScrapeRequest(BaseModel):
    brand_id: str = Field(max_length=100)
    urls: list[str] = Field(min_length=1, max_length=10)


class ProfileUpdate(BaseModel):
    franchise_profile: dict


class FranchiseGenerateRequest(BaseModel):
    brand_id: str = Field(max_length=100)
    page_type: str = Field(max_length=50)


def _run_scrape_job(job_id: str, urls: list[str]):
    loop = asyncio.new_event_loop()
    try:
        from app.services.scraper import scrape_url

        async def run():
            results, errors = [], []
            for u in urls:
                try:
                    page = await scrape_url(u)
                    page["url"] = u
                    results.append(page)
                except Exception as e:
                    errors.append(f"{u}: {e}")
            if not results:
                raise RuntimeError("All scrapes failed: " + "; ".join(errors))
            sheet = await extract_fact_sheet(results)
            sheet["source_urls"] = urls
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


@router.post("/api/franchise/scrape")
def start_scrape(req: ScrapeRequest, _auth: dict = Depends(require_auth)):
    _evict_stale_jobs()
    job_id = str(uuid.uuid4())
    _scrape_jobs[job_id] = {"status": "pending", "_created": time.time()}
    threading.Thread(target=_run_scrape_job, args=(job_id, req.urls), daemon=True).start()
    return {"job_id": job_id, "status": "pending"}


@router.get("/api/franchise/scrape/status/{job_id}")
def scrape_status(job_id: str, _auth: dict = Depends(require_auth)):
    _evict_stale_jobs()
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


@router.post("/api/franchise/generate")
async def generate_page(req: FranchiseGenerateRequest, _auth: dict = Depends(require_auth)):
    if req.page_type not in PAGE_TYPES:
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
        "You write franchise development (franchisee recruitment) pages for prospective franchisees.",
    )
    user = build_franchise_user_prompt(req.page_type, brand.get("name", ""), sheet)

    return StreamingResponse(
        stream_claude(system, user, model=get_generation_model()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
