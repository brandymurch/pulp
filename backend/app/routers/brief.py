"""Brief router - POP optimization brief endpoint."""
from __future__ import annotations
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_auth
from app.config import POP_API_KEY
from app.models import BriefRequest, BriefResponse
from app.services.pop import get_enriched_brief

logger = logging.getLogger(__name__)

router = APIRouter(tags=["brief"])


@router.post("/api/brief", response_model=BriefResponse)
async def create_brief(req: BriefRequest, _auth: dict = Depends(require_auth)):
    """Get a POP optimization brief for a keyword."""
    if not POP_API_KEY:
        raise HTTPException(status_code=503, detail="POP_API_KEY not configured")

    try:
        result = await get_enriched_brief(
            keyword=req.keyword,
            target_url=req.target_url,
            location_name=req.location,
        )
        return BriefResponse(
            target_word_count=result["target_word_count"],
            term_targets=result["term_targets"],
            lsa_phrases=result["lsa_phrases"],
        )
    except Exception as e:
        logger.error(f"Brief generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
