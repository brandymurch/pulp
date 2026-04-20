"""Content generation endpoints with SSE streaming."""
from __future__ import annotations
import json
import logging
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.auth import require_auth
from app.models import OutlineRequest, GenerateRequest, ReviseRequest
from app.services.claude import stream_claude, call_claude
from app.services.content_generator import (
    build_system_prompt, build_user_prompt,
    build_outline_prompt, build_revision_prompts,
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
    raw = await call_claude(system, user, max_tokens=4000, temperature=0.3)
    # Parse JSON (Claude may wrap in ```json)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(raw)


@router.post("")
async def generate_content(req: GenerateRequest, _=Depends(require_auth)):
    """Generate full content via SSE stream."""
    system = build_system_prompt(
        template=req.template,
        style_examples=req.style_examples,
    )
    user = build_user_prompt(
        keyword=req.keyword, city=req.city, state=req.state,
        brief=req.brief, template=req.template, outline=req.outline,
        competitors=req.competitor_content,
        style_examples=req.style_examples,
    )
    return StreamingResponse(
        stream_claude(system, user),
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
