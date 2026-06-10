"""CRUD routes for generations."""
from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, HTTPException
from app.auth import require_auth
from app.db import get_db
from app.models import SaveGenerationRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/generations", tags=["generations"])


@router.get("")
def list_generations(brand_id: str | None = None, location_id: str | None = None, limit: int = 50, offset: int = 0, _=Depends(require_auth)):
    db = get_db()
    query = db.table("generations").select("*")
    if brand_id:
        query = query.eq("brand_id", brand_id)
    if location_id:
        query = query.eq("location_id", location_id)
    try:
        result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    except Exception as e:
        logger.error("Generation list failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    return result.data


@router.get("/{gen_id}")
def get_generation(gen_id: str, _=Depends(require_auth)):
    db = get_db()
    try:
        result = db.table("generations").select("*").eq("id", gen_id).limit(1).execute()
    except Exception as e:
        logger.error("Generation lookup failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    if not result.data:
        raise HTTPException(status_code=404, detail="Generation not found")
    return result.data[0]


@router.post("")
def save_generation(req: SaveGenerationRequest, _=Depends(require_auth)):
    db = get_db()
    try:
        result = db.table("generations").insert(req.model_dump()).execute()
    except Exception as e:
        logger.error("Generation save failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    return result.data[0]


@router.delete("/{gen_id}")
def delete_generation(gen_id: str, _=Depends(require_auth)):
    db = get_db()
    try:
        db.table("generations").delete().eq("id", gen_id).execute()
    except Exception as e:
        logger.error("Generation delete failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    return {"ok": True}
