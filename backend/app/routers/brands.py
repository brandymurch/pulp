"""CRUD routes for brands."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from app.auth import require_auth
from app.db import get_db

router = APIRouter(prefix="/api/brands", tags=["brands"])


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
