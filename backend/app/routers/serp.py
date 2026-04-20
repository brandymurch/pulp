"""SERP router - POST /api/serp."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from app.auth import require_auth
from app.models import SerpRequest
from app.services.serp import get_serp_results

router = APIRouter(prefix="/api/serp", tags=["serp"])


@router.post("")
async def serp(req: SerpRequest, _=Depends(require_auth)):
    return await get_serp_results(req.keyword, req.location or "United States")
