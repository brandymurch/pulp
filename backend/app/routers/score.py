"""Score router - content scoring endpoint."""
from __future__ import annotations
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_auth
from app.config import POP_API_KEY
from app.models import ScoreRequest, ScoreResponse
from app.services.pop import score_content_with_pop, stub_score

logger = logging.getLogger(__name__)

router = APIRouter(tags=["score"])


@router.post("/api/score", response_model=ScoreResponse)
async def score_content(req: ScoreRequest, _auth: dict = Depends(require_auth)):
    """Score content against a target keyword."""
    try:
        if POP_API_KEY:
            result = await score_content_with_pop(
                content=req.content,
                target_keyword=req.keyword,
                url=req.target_url,
            )
        else:
            result = stub_score(content=req.content, target_keyword=req.keyword)

        return ScoreResponse(**result)
    except Exception as e:
        logger.error(f"Scoring failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
