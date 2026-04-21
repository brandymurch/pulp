"""CRUD routes for brands."""
from __future__ import annotations
from typing import Any, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.auth import require_auth
from app.db import get_db

router = APIRouter(prefix="/api/brands", tags=["brands"])


class UpdateBrandRequest(BaseModel):
    voice_notes: Optional[str] = None
    voice_dimensions: Optional[list[dict[str, Any]]] = None
    brand_banned_words: Optional[list[str]] = None
    default_tone: Optional[str] = None
    services: Optional[list[str]] = None
    brand_guidelines: Optional[str] = None


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
