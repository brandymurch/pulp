"""Locations CRUD router."""
from __future__ import annotations
import logging
from typing import Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.auth import require_auth
from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/locations", tags=["locations"])


class CreateLocationRequest(BaseModel):
    brand_id: str
    name: str
    city: str
    state: str
    slug: str | None = None
    local_context: dict[str, Any] | None = None


class UpdateLocationRequest(BaseModel):
    name: str | None = None
    city: str | None = None
    state: str | None = None
    slug: str | None = None
    status: str | None = None
    local_context: dict[str, Any] | None = None


@router.get("")
async def list_locations(brand_id: str, _=Depends(require_auth)):
    db = get_db()
    result = db.table("locations").select("*").eq("brand_id", brand_id).order("city").execute()
    return result.data


@router.get("/{location_id}")
async def get_location(location_id: str, _=Depends(require_auth)):
    db = get_db()
    result = db.table("locations").select("*").eq("id", location_id).single().execute()
    return result.data


@router.post("")
async def create_location(req: CreateLocationRequest, _=Depends(require_auth)):
    db = get_db()
    data = req.model_dump(exclude_none=True)
    if "local_context" not in data:
        data["local_context"] = {}
    if "slug" not in data or not data["slug"]:
        data["slug"] = f"/{data['city'].lower().replace(' ', '-')}-{data['state'].lower()}"
    result = db.table("locations").insert(data).execute()
    return result.data[0]


@router.patch("/{location_id}")
async def update_location(location_id: str, req: UpdateLocationRequest, _=Depends(require_auth)):
    db = get_db()
    data = req.model_dump(exclude_none=True)
    if not data:
        return {"ok": True}
    result = db.table("locations").update(data).eq("id", location_id).execute()
    return result.data[0] if result.data else {"ok": True}


@router.delete("/{location_id}")
async def delete_location(location_id: str, _=Depends(require_auth)):
    db = get_db()
    db.table("locations").delete().eq("id", location_id).execute()
    return {"ok": True}


class GoogleSearchRequest(BaseModel):
    business_name: str
    city: str
    state: str


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
