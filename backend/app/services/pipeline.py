"""Server-side content generation pipeline."""
from __future__ import annotations
import asyncio
import json
import logging
import threading
from typing import Any, Optional

from app.config import POP_API_KEY, ANTHROPIC_API_KEY
from app.db import get_db

logger = logging.getLogger(__name__)


def _update_job(job_id: str, **fields):
    """Update pipeline job in Supabase."""
    try:
        db = get_db()
        db.table("pipeline_jobs").update(fields).eq("id", job_id).execute()
    except Exception as e:
        logger.error(f"Failed to update pipeline job {job_id}: {e}")


def run_pipeline(
    job_id: str,
    keyword: str,
    city: str,
    state: str,
    brand_id: str,
    location_id: Optional[str] = None,
    template_id: Optional[str] = None,
    content_type: str = "landing_page",
    competitor_urls: Optional[list] = None,
    feedback: Optional[str] = None,
):
    """Run the full pipeline in a background thread."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_run_pipeline_async(
            job_id, keyword, city, state, brand_id,
            location_id, template_id, content_type, competitor_urls, feedback,
        ))
    except Exception as e:
        logger.error(f"Pipeline {job_id} failed: {e}")
        _update_job(job_id, phase="error", error=str(e))
    finally:
        loop.close()


def resume_pipeline(job_id: str):
    """Resume pipeline after outline approval. Runs in a background thread."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_resume_pipeline_async(job_id))
    except Exception as e:
        logger.error(f"Pipeline resume {job_id} failed: {e}")
        _update_job(job_id, phase="error", error=str(e))
    finally:
        loop.close()


async def _resume_pipeline_async(job_id: str):
    """Load job data from Supabase and continue from phase 2."""
    db = get_db()
    result = db.table("pipeline_jobs").select("*").eq("id", job_id).single().execute()
    job = result.data
    if not job:
        raise RuntimeError(f"Pipeline job {job_id} not found")

    from app.services.content_generator import (
        build_system_prompt, build_user_prompt, build_revision_prompts,
    )

    keyword = job["keyword"]
    city = job["city"]
    state = job.get("state", "")
    brand_id = job.get("brand_id", "")
    location_id = job.get("location_id")
    content_type = job.get("content_type", "landing_page")
    outline = job.get("outline")
    brief = job.get("brief") or {}

    # Reload brand, style examples, template, location data
    brand_data = {}
    if brand_id:
        try:
            r = db.table("brands").select("*").eq("id", brand_id).single().execute()
            brand_data = r.data or {}
        except Exception:
            pass

    style_examples = []
    if brand_id:
        try:
            r = db.table("style_examples").select("*").eq("brand_id", brand_id).execute()
            style_examples = r.data or []
        except Exception:
            pass

    local_context = None
    if location_id:
        try:
            r = db.table("locations").select("local_context").eq("id", location_id).single().execute()
            local_context = (r.data or {}).get("local_context")
        except Exception:
            pass

    template_content = None
    template_id = job.get("template_id")
    if template_id:
        try:
            from app.services.notion import get_template
            template_content = get_template(template_id)
        except Exception:
            pass

    await _run_pipeline_phase2(
        job_id, keyword, city, state, brand_id, location_id,
        content_type, outline, brief, brand_data, style_examples,
        template_content, local_context,
    )


async def _run_pipeline_async(
    job_id: str,
    keyword: str,
    city: str,
    state: str,
    brand_id: str,
    location_id: Optional[str],
    template_id: Optional[str],
    content_type: str,
    competitor_urls: Optional[list],
    feedback: Optional[str] = None,
):
    """Async pipeline implementation."""
    import anthropic
    from app.config import ANTHROPIC_API_KEY
    from app.services.pop import get_enriched_brief, score_content_with_pop, stub_score
    from app.services.content_generator import (
        build_system_prompt, build_user_prompt,
        build_outline_prompt, build_revision_prompts,
    )

    db = get_db()

    # Load brand data
    brand_data = {}
    if brand_id:
        try:
            result = db.table("brands").select("*").eq("id", brand_id).single().execute()
            brand_data = result.data or {}
        except Exception:
            pass

    # Load location data
    local_context = None
    if location_id:
        try:
            result = db.table("locations").select("local_context").eq("id", location_id).single().execute()
            local_context = (result.data or {}).get("local_context")
        except Exception:
            pass

    # Load style examples
    style_examples = []
    if brand_id:
        try:
            result = db.table("style_examples").select("*").eq("brand_id", brand_id).execute()
            style_examples = result.data or []
        except Exception:
            pass

    # Load template from Notion if template_id provided
    template_content = None
    if template_id:
        try:
            from app.services.notion import get_template
            template_content = get_template(template_id)
        except Exception as e:
            logger.warning(f"Template load failed: {e}")

    # -- STEP 1: SEO Brief + Competitors + SERP (parallel) --
    _update_job(job_id, phase="brief")

    # Run brief, SERP, and competitor scraping in parallel
    import asyncio as _aio
    from app.services.serp import get_serp_results
    from app.services.scraper import scrape_urls

    brief = None
    serp_data = {"paa_questions": [], "ai_fanout_queries": [], "related_searches": []}
    competitors_scraped = []

    async def fetch_brief():
        nonlocal brief
        brief = await get_enriched_brief(
            keyword=keyword,
            location_name=f"{city}, {state}" if state else city,
        )

    async def fetch_serp():
        nonlocal serp_data
        try:
            serp_data = await get_serp_results(keyword, f"{city}, {state}")
        except Exception as e:
            logger.warning(f"SERP fetch failed (continuing): {e}")

    async def fetch_competitors():
        nonlocal competitors_scraped
        try:
            urls = competitor_urls or []
            # If no manual URLs, use top organic results from SERP
            if not urls and serp_data.get("organic_results"):
                urls = [r["url"] for r in serp_data["organic_results"][:3] if r.get("url")]
            if urls:
                competitors_scraped = await scrape_urls(urls[:3])
        except Exception as e:
            logger.warning(f"Competitor scraping failed (continuing): {e}")

    # Brief is required, SERP and competitors are optional
    try:
        # Run brief and SERP in parallel first
        await _aio.gather(fetch_brief(), fetch_serp(), return_exceptions=True)
        if brief is None:
            _update_job(job_id, phase="error", error="SEO brief failed")
            return
        # Then scrape competitors (may use SERP organic URLs)
        await fetch_competitors()
        _update_job(job_id, brief=brief)
    except Exception as e:
        _update_job(job_id, phase="error", error=f"SEO brief failed: {e}")
        return

    # Combine PAA + AI fanout queries
    paa_questions = (serp_data.get("paa_questions") or []) + (serp_data.get("ai_fanout_queries") or [])

    # -- STEP 2: Outline --
    _update_job(job_id, phase="outline")
    try:
        system, user = build_outline_prompt(
            keyword=keyword, city=city, state=state,
            brief=brief, template=template_content,
            paa=paa_questions,
            competitors=competitors_scraped,
        )
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000, temperature=0.3,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        raw = "".join(b.text for b in response.content if hasattr(b, "text"))
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        outline = json.loads(raw)
        _update_job(job_id, outline=outline, phase="outline_review")
        # PAUSE: wait for user approval before continuing
        return
    except Exception as e:
        logger.warning(f"Outline generation failed, continuing without: {e}")
        outline = None
        # If outline fails, skip review and go to generate
    # Fall through to generate if outline failed (no return above)
    await _run_pipeline_phase2(
        job_id, keyword, city, state, brand_id, location_id,
        content_type, outline, brief, brand_data, style_examples,
        template_content, local_context, competitors_scraped, feedback,
    )


async def _run_pipeline_phase2(
    job_id: str, keyword: str, city: str, state: str,
    brand_id: str, location_id: Optional[str],
    content_type: str, outline: Optional[dict], brief: dict,
    brand_data: dict, style_examples: list,
    template_content: Optional[dict], local_context: Optional[dict],
    competitors: Optional[list] = None,
    feedback: Optional[str] = None,
):
    """Phase 2: generate, score, revise, save. Called after outline approval."""
    import anthropic
    from app.config import ANTHROPIC_API_KEY, POP_API_KEY
    from app.services.pop import score_content_with_pop, stub_score
    from app.services.content_generator import (
        build_system_prompt, build_user_prompt, build_revision_prompts,
    )

    db = get_db()

    _update_job(job_id, phase="generating")
    try:
        # Combine brand guidelines with user feedback
        guidelines = brand_data.get("brand_guidelines") or ""
        if feedback:
            guidelines = f"{guidelines}\n\nUSER FEEDBACK (apply to this generation):\n{feedback}" if guidelines else f"USER FEEDBACK (apply to this generation):\n{feedback}"

        system_prompt = build_system_prompt(
            template=template_content,
            style_examples=style_examples,
            services=brand_data.get("services") or [],
            voice_dimensions=brand_data.get("voice_dimensions"),
            voice_notes=brand_data.get("voice_notes"),
            brand_banned_words=brand_data.get("brand_banned_words"),
            brand_guidelines=guidelines,
            brand_competitors=brand_data.get("competitors") or [],
        )
        user_prompt = build_user_prompt(
            keyword=keyword, city=city, state=state,
            brief=brief, template=template_content, outline=outline,
            competitors=competitors or [], style_examples=style_examples,
            local_context=local_context,
            content_type=content_type,
        )

        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        full_text = ""
        usage = {"input_tokens": 0, "output_tokens": 0}

        async with client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=12000, temperature=0.4,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            async for event in stream:
                if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                    full_text += event.delta.text

            msg = await stream.get_final_message()
            if msg and msg.usage:
                usage["input_tokens"] = msg.usage.input_tokens
                usage["output_tokens"] = msg.usage.output_tokens

        # Strip em dashes
        full_text = full_text.replace("\u2014", "-").replace("\u2013", "-")
        word_count = len(full_text.split())

        _update_job(
            job_id, content=full_text,
            word_count=word_count,
            input_tokens=usage["input_tokens"],
            output_tokens=usage["output_tokens"],
        )
    except Exception as e:
        _update_job(job_id, phase="error", error=f"Content generation failed: {e}")
        return

    # -- STEP 4: Score via POP --
    _update_job(job_id, phase="scoring")
    try:
        if POP_API_KEY:
            score_result = await score_content_with_pop(
                content=full_text, target_keyword=keyword,
            )
        else:
            score_result = stub_score(content=full_text, target_keyword=keyword)
        _update_job(job_id, score=score_result)
    except Exception as e:
        logger.warning(f"Scoring failed: {e}")
        score_result = None

    # -- STEP 5: Auto-revise if score < 75 (max 2 rounds) --
    revision_count = 0
    if score_result and score_result.get("overall_score", 100) < 75:
        for rev_round in range(2):
            _update_job(job_id, phase="revising", revision_count=revision_count + 1)
            try:
                system_rev, user_rev = build_revision_prompts(
                    content=full_text, keyword=keyword,
                    brief=brief, pop_feedback=score_result,
                )
                revised_text = ""
                async with client.messages.stream(
                    model="claude-sonnet-4-20250514",
                    max_tokens=12000, temperature=0.4,
                    system=system_rev,
                    messages=[{"role": "user", "content": user_rev}],
                ) as stream:
                    async for event in stream:
                        if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                            revised_text += event.delta.text

                revised_text = revised_text.replace("\u2014", "-").replace("\u2013", "-")
                full_text = revised_text
                word_count = len(full_text.split())
                revision_count += 1

                _update_job(job_id, content=full_text, word_count=word_count, revision_count=revision_count)

                # Re-score via POP
                _update_job(job_id, phase="scoring")
                if POP_API_KEY:
                    score_result = await score_content_with_pop(
                        content=full_text, target_keyword=keyword,
                    )
                else:
                    score_result = stub_score(content=full_text, target_keyword=keyword)
                _update_job(job_id, score=score_result)

                if score_result.get("overall_score", 100) >= 75:
                    break
            except Exception as e:
                logger.warning(f"Revision round {rev_round + 1} failed: {e}")
                break

    # -- Done: auto-save to generations table --
    _update_job(job_id, phase="done")
    try:
        gen_data = {
            "brand_id": brand_id,
            "keyword": keyword,
            "city": city,
            "content": full_text,
            "content_type": content_type,
            "model": "sonnet",
            "word_count": word_count,
            "input_tokens": usage.get("input_tokens", 0) if usage else 0,
            "output_tokens": usage.get("output_tokens", 0) if usage else 0,
            "revision_count": revision_count,
        }
        if location_id:
            gen_data["location_id"] = location_id
        if outline:
            gen_data["outline"] = json.dumps(outline)
        if template_content and isinstance(template_content, dict):
            gen_data["template_name"] = template_content.get("name", "")
        if brief:
            gen_data["pop_brief"] = brief
        if score_result:
            gen_data["pop_score"] = score_result
        db.table("generations").insert(gen_data).execute()

        # Update location's last_refresh_at
        if location_id:
            try:
                db.table("locations").update({
                    "last_refresh_at": "now()",
                    "status": "live",
                }).eq("id", location_id).execute()
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Failed to auto-save generation: {e}")
