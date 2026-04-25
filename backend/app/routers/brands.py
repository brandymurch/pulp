"""CRUD routes for brands."""
from __future__ import annotations
from typing import Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.auth import require_auth
from app.db import get_db

router = APIRouter(prefix="/api/brands", tags=["brands"])


class UpdateBrandRequest(BaseModel):
    voice_notes: str | None = None
    voice_dimensions: list[dict[str, Any]] | None = None
    brand_banned_words: list[str] | None = None
    default_tone: str | None = None
    services: list[str] | None = None
    brand_guidelines: str | None = None
    competitors: list[str] | None = None


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
