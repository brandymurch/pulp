"""Generate router - content generation endpoint."""
from __future__ import annotations
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_auth
from app.config import ANTHROPIC_API_KEY
from app.models import GenerateRequest, GenerateResponse
from app.services.claude import generate_content

logger = logging.getLogger(__name__)

router = APIRouter(tags=["generate"])


@router.post("/api/generate", response_model=GenerateResponse)
async def create_content(req: GenerateRequest, _auth: dict = Depends(require_auth)):
    """Generate SEO-optimized content using Claude."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    try:
        result = await generate_content(
            keyword=req.keyword,
            brief=req.brief,
            business_name=req.business_name,
            city=req.city,
            services=req.services,
            content_type=req.content_type,
        )
        return GenerateResponse(
            title=result["title"],
            content=result["content"],
            word_count=result["word_count"],
        )
    except Exception as e:
        logger.error(f"Content generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
