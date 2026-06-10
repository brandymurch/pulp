"""Locations CRUD router."""
from __future__ import annotations
import json
import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.auth import require_auth
from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/locations", tags=["locations"])


class CreateLocationRequest(BaseModel):
    brand_id: str
    name: str = Field(max_length=500)
    city: str = Field(max_length=200)
    state: str = Field(max_length=100)
    slug: str | None = Field(default=None, max_length=500)
    local_context: dict[str, Any] | None = None


class UpdateLocationRequest(BaseModel):
    name: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=200)
    state: str | None = Field(default=None, max_length=100)
    slug: str | None = Field(default=None, max_length=500)
    status: str | None = Field(default=None, max_length=100)
    local_context: dict[str, Any] | None = None


@router.get("")
def list_locations(brand_id: str, _=Depends(require_auth)):
    db = get_db()
    try:
        result = db.table("locations").select("*").eq("brand_id", brand_id).order("city").execute()
    except Exception as e:
        logger.error("Location list failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    return result.data


@router.get("/{location_id}")
def get_location(location_id: str, _=Depends(require_auth)):
    db = get_db()
    try:
        result = db.table("locations").select("*").eq("id", location_id).limit(1).execute()
    except Exception as e:
        logger.error("Location lookup failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    if not result.data:
        raise HTTPException(status_code=404, detail="Location not found")
    return result.data[0]


@router.post("")
def create_location(req: CreateLocationRequest, _=Depends(require_auth)):
    db = get_db()
    data = req.model_dump(exclude_none=True)
    if "local_context" not in data:
        data["local_context"] = {}
    if "slug" not in data or not data["slug"]:
        data["slug"] = f"/{data['city'].lower().replace(' ', '-')}-{data['state'].lower()}"
    try:
        result = db.table("locations").insert(data).execute()
    except Exception as e:
        logger.error("Location create failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    return result.data[0]


@router.patch("/{location_id}")
def update_location(location_id: str, req: UpdateLocationRequest, _=Depends(require_auth)):
    db = get_db()
    data = req.model_dump(exclude_none=True)
    if not data:
        return {"ok": True}
    try:
        result = db.table("locations").update(data).eq("id", location_id).execute()
    except Exception as e:
        logger.error("Location update failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    return result.data[0] if result.data else {"ok": True}


@router.delete("/{location_id}")
def delete_location(location_id: str, _=Depends(require_auth)):
    db = get_db()
    try:
        db.table("locations").delete().eq("id", location_id).execute()
    except Exception as e:
        logger.error("Location delete failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    return {"ok": True}


class GoogleSearchRequest(BaseModel):
    business_name: str = Field(max_length=500)
    city: str = Field(max_length=200)
    state: str = Field(max_length=100)


@router.post("/google-search")
async def google_search(req: GoogleSearchRequest, _=Depends(require_auth)):
    """Search Google Maps for a business and return profile data + reviews."""
    from app.services.google_business import search_google_business
    result = await search_google_business(
        business_name=req.business_name,
        city=req.city,
        state=req.state,
    )
    return result


class EnrichRequest(BaseModel):
    city: str = Field(max_length=200)
    state: str = Field(max_length=100)
    brand_name: str | None = Field(default=None, max_length=500)
    services: list[str] | None = None
    industry_hint: str | None = Field(default=None, max_length=500)


@router.post("/enrich")
async def enrich_local_context(req: EnrichRequest, _=Depends(require_auth)):
    """Suggest city-level local-context fields for a city/state and brand.

    Used by the pipeline at generation time. Also exposed for ad-hoc use
    (e.g. for previewing what a city's enriched context would look like).
    """
    from app.services.location_enrich import enrich_for_city
    return await enrich_for_city(
        city=req.city,
        state=req.state,
        brand_name=req.brand_name or "",
        services=req.services,
        industry_hint=req.industry_hint,
    )
