"""Content generation endpoints with SSE streaming."""
from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from app.auth import require_auth
from app.models import OutlineRequest, GenerateRequest, ReviseRequest
from app.services.claude import (
    stream_claude, call_claude, extract_json, get_generation_model,
)
from app.services.content_generator import (
    build_system_prompt, build_user_prompt,
    build_outline_prompt, build_revision_prompts,
    OUTLINE_SCHEMA,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/generate", tags=["generate"])


@router.post("/outline")
async def generate_outline(req: OutlineRequest, _=Depends(require_auth)):
    """Generate content outline (JSON response, not SSE)."""
    system, user = build_outline_prompt(
        keyword=req.keyword, city=req.city, state=req.state,
        brief=req.brief, template=req.template,
        paa=req.paa_questions, competitors=req.competitors,
    )
    try:
        raw = await call_claude(
            system, user, max_tokens=4000, temperature=0.3,
            output_schema=OUTLINE_SCHEMA,
        )
        return extract_json(raw)
    except HTTPException:
        raise
    except ValueError as e:
        logger.error("Outline JSON parse failed: %s", e)
        raise HTTPException(status_code=502, detail="Outline generation returned invalid JSON. Try again.")
    except Exception as e:
        logger.error("Outline generation failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Outline generation failed: {e}")


@router.post("")
async def generate_content(req: GenerateRequest, _=Depends(require_auth)):
    """Generate full content via SSE stream.

    Builds the prompts through the same assembly functions as the pipeline,
    with the full brand context (services, competitors, learnings, brand
    template, brand name, city enrichment), so interactive generations match
    pipeline quality.
    """
    from app.db import get_db

    # Load the full brand row, the same way the pipeline does.
    brand_data = {}
    if req.brand_id:
        try:
            db = get_db()
            brand = db.table("brands").select("*").eq("id", req.brand_id).single().execute()
            brand_data = brand.data or {}
        except Exception as e:
            logger.warning("Could not load brand settings: %s", e)

    # Load location context if location_id provided
    local_context = None
    if req.location_id:
        try:
            db = get_db()
            loc = db.table("locations").select("local_context").eq("id", req.location_id).single().execute()
            if loc.data:
                local_context = loc.data.get("local_context")
        except Exception as e:
            logger.warning("Could not load location context: %s", e)

    brand_name = brand_data.get("name") or req.business_name or ""
    services = brand_data.get("services") or req.services or []

    # City enrichment + franchise merge, same as the pipeline.
    from app.services.location_enrich import enrich_for_city, merge_with_franchise_context
    try:
        city_enrichment = await enrich_for_city(
            city=req.city, state=req.state,
            brand_name=brand_name, services=services,
        )
    except Exception as e:
        logger.warning("city enrichment failed (continuing without): %s", e)
        city_enrichment = {}
    local_context = merge_with_franchise_context(city_enrichment, local_context)

    # Brand content template for this content type, same as the pipeline.
    brand_templates = brand_data.get("content_templates") or {}
    brand_template = brand_templates.get(req.content_type) or ""

    system = build_system_prompt(
        template=req.template,
        style_examples=req.style_examples,
        services=services,
        voice_dimensions=brand_data.get("voice_dimensions"),
        voice_notes=brand_data.get("voice_notes"),
        brand_banned_words=brand_data.get("brand_banned_words"),
        brand_guidelines=brand_data.get("brand_guidelines"),
        brand_competitors=brand_data.get("competitors") or [],
        prompt_learnings=brand_data.get("prompt_learnings"),
    )
    user = build_user_prompt(
        keyword=req.keyword, city=req.city, state=req.state,
        brief=req.brief, template=req.template, outline=req.outline,
        competitors=req.competitor_content,
        local_context=local_context,
        content_type=req.content_type,
        brand_template=brand_template,
        brand_name=brand_name,
    )
    return StreamingResponse(
        stream_claude(system, user, model=get_generation_model()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/revise")
async def revise_content(req: ReviseRequest, _=Depends(require_auth)):
    """Revise content based on POP feedback via SSE stream."""
    system, user = build_revision_prompts(
        content=req.content, keyword=req.keyword,
        brief=req.brief, pop_feedback=req.pop_feedback,
    )
    return StreamingResponse(
        stream_claude(system, user),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
