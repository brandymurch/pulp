"""CRUD routes for generations."""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends
from app.auth import require_auth
from app.db import get_db
from app.models import SaveGenerationRequest

router = APIRouter(prefix="/api/generations", tags=["generations"])


@router.get("")
async def list_generations(brand_id: str, location_id: Optional[str] = None, limit: int = 50, offset: int = 0, _=Depends(require_auth)):
    db = get_db()
    query = db.table("generations").select("*").eq("brand_id", brand_id)
    if location_id:
        query = query.eq("location_id", location_id)
    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return result.data


@router.get("/{gen_id}")
async def get_generation(gen_id: str, _=Depends(require_auth)):
    db = get_db()
    result = db.table("generations").select("*").eq("id", gen_id).single().execute()
    return result.data


@router.post("")
async def save_generation(req: SaveGenerationRequest, _=Depends(require_auth)):
    db = get_db()
    result = db.table("generations").insert(req.model_dump()).execute()
    return result.data[0]


@router.delete("/{gen_id}")
async def delete_generation(gen_id: str, _=Depends(require_auth)):
    db = get_db()
    db.table("generations").delete().eq("id", gen_id).execute()
    return {"ok": True}
