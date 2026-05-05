"""CRUD routes for brands."""
from __future__ import annotations
import asyncio
import logging
import threading
import uuid
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import require_auth
from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/brands", tags=["brands"])

# In-memory store for template generation jobs
_template_jobs: dict[str, dict] = {}


class UpdateBrandRequest(BaseModel):
    voice_notes: str | None = None
    voice_dimensions: list[dict[str, Any]] | None = None
    brand_banned_words: list[str] | None = None
    default_tone: str | None = None
    services: list[str] | None = None
    brand_guidelines: str | None = None
    competitors: list[str] | None = None
    prompt_learnings: list[str] | None = None
    content_templates: dict[str, str] | None = None


@router.get("")
async def list_brands(_=Depends(require_auth)):
    db = get_db()
    result = db.table("brands").select("*").execute()
    return result.data


@router.get("/{brand_id}")
async def get_brand(brand_id: str, _=Depends(require_auth)):
    db = get_db()
    result = db.table("brands").select("*").eq("id", brand_id).single().execute()
    return result.data


@router.patch("/{brand_id}")
async def update_brand(brand_id: str, req: UpdateBrandRequest, _=Depends(require_auth)):
    db = get_db()
    data = req.model_dump(exclude_none=True)
    if not data:
        return {"ok": True}
    result = db.table("brands").update(data).eq("id", brand_id).execute()
    return result.data[0] if result.data else {"ok": True}


def _run_template_gen(job_id: str, brand_data: dict):
    """Run POP + Claude template generation in a background thread."""
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(_generate_template_async(brand_data))
        _template_jobs[job_id] = {"status": "done", **result}
    except Exception as e:
        logger.error("Template generation %s failed: %s", job_id, e)
        _template_jobs[job_id] = {"status": "error", "error": str(e)}
    finally:
        loop.close()


async def _generate_template_async(brand_data: dict) -> dict:
    import anthropic
    from app.config import ANTHROPIC_API_KEY
    from app.services.pop import get_enriched_brief

    keyword = brand_data.get("primary_keyword") or brand_data.get("name", "")
    brief = await get_enriched_brief(keyword=keyword, location_name="United States")

    competitor_headings = brief.get("competitor_headings", [])
    recommended_h2 = brief.get("recommended_heading_count", 0)
    target_wc = brief.get("target_word_count", 1500)
    terms = brief.get("term_targets", [])
    top_terms = sorted(terms, key=lambda t: t.get("weight", 0), reverse=True)[:20]
    services = brand_data.get("services") or []
    lsa = brief.get("lsa_phrases", [])

    system = (
        "You are a content strategist. Generate a landing page template skeleton in markdown.\n"
        "Use [location] as a placeholder for the city/area name.\n"
        "Use [brand] as a placeholder for the brand name.\n"
        "Include <Button> tags where CTAs should go.\n"
        "The template should define section headings and 1-2 sentence descriptions of what content belongs in each section.\n"
        "Do NOT write full paragraphs of final content.\n"
        "Structure should be optimized for SEO based on the competitor data provided.\n"
        "Never use em dashes."
    )

    user_parts = [
        f"Generate a landing page template for \"{brand_data.get('name', '')}\".",
        f"Primary keyword: \"{keyword}\"",
        f"Target word count: {target_wc}",
        f"Recommended H2 sections: {recommended_h2 or 'use your judgment'}",
    ]
    if services:
        user_parts.append(f"Services: {', '.join(services)}")
    if competitor_headings:
        user_parts.append("\nCompetitor headings (top-ranking pages):")
        for h in competitor_headings[:15]:
            user_parts.append(f"  - {h}")
    if top_terms:
        user_parts.append("\nTop SEO terms:")
        for t in top_terms[:15]:
            user_parts.append(f"  - \"{t.get('phrase', '')}\" (weight: {t.get('weight', 0)})")
    if lsa:
        lsa_text = [item.get("phrase", "") if isinstance(item, dict) else item for item in lsa[:10]]
        user_parts.append(f"\nSemantic terms: {', '.join(lsa_text)}")
    user_parts.append("\nGenerate the template skeleton now.")

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=6000, temperature=0.3,
        system=system,
        messages=[{"role": "user", "content": "\n".join(user_parts)}],
    )
    template = "".join(b.text for b in response.content if hasattr(b, "text")).strip()
    if template.startswith("```"):
        template = template.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    return {
        "template": template,
        "target_word_count": target_wc,
        "recommended_h2": recommended_h2,
        "competitor_headings": competitor_headings[:15],
        "top_terms": [t.get("phrase", "") for t in top_terms[:15]],
    }


@router.post("/{brand_id}/generate-template")
async def generate_template(brand_id: str, _=Depends(require_auth)):
    """Start POP-based template generation. Returns job_id to poll."""
    from app.config import POP_API_KEY
    if not POP_API_KEY:
        raise HTTPException(status_code=503, detail="POP_API_KEY not configured")

    db = get_db()
    brand = db.table("brands").select("*").eq("id", brand_id).single().execute()
    if not brand.data:
        raise HTTPException(status_code=404, detail="Brand not found")
    if not brand.data.get("primary_keyword"):
        raise HTTPException(status_code=400, detail="Brand needs a primary_keyword")

    job_id = str(uuid.uuid4())
    _template_jobs[job_id] = {"status": "pending"}

    thread = threading.Thread(
        target=_run_template_gen, args=(job_id, brand.data), daemon=True
    )
    thread.start()
    return {"job_id": job_id, "status": "pending"}


@router.get("/generate-template/status/{job_id}")
async def template_gen_status(job_id: str, _=Depends(require_auth)):
    """Poll for template generation result."""
    job = _template_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] == "pending":
        return {"status": "pending"}
    if job["status"] == "error":
        _template_jobs.pop(job_id, None)
        raise HTTPException(status_code=500, detail=job["error"])
    if job["status"] == "done":
        result = dict(job)
        _template_jobs.pop(job_id, None)
        return result
    return {"status": "unknown"}
