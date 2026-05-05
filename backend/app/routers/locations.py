"""Locations CRUD router."""
from __future__ import annotations
import json
import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
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


class EnrichRequest(BaseModel):
    city: str
    state: str
    brand_name: str | None = None
    services: list[str] | None = None
    industry_hint: str | None = None


@router.post("/enrich")
async def enrich_local_context(req: EnrichRequest, _=Depends(require_auth)):
    """Suggest local-context field values (neighborhoods, housing stock, climate,
    common jobs, local challenges, fun facts) for a given city/state and brand.

    Returns a JSON object the frontend can use to fill empty fields. Caller
    decides whether to overwrite user-set values.
    """
    import anthropic
    from app.config import ANTHROPIC_API_KEY

    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    services_line = ""
    if req.services:
        services_line = f"Brand services: {', '.join(req.services[:10])}\n"

    brand_line = f"Brand: {req.brand_name}\n" if req.brand_name else ""
    industry_line = f"Industry: {req.industry_hint}\n" if req.industry_hint else ""

    system = (
        "You enrich location context for a local-business SEO tool. Given a city, state, "
        "and the brand's services, return concrete, locally-grounded details that can be "
        "woven into landing-page content for that location. Be specific, not generic. "
        "If you are not confident about a fact, leave that field as an empty string or empty list "
        "rather than inventing details. Never use em dashes.\n\n"
        "Return ONLY valid JSON with exactly these keys:\n"
        '{\n'
        '  "neighborhoods": [list of 4-8 well-known neighborhoods or districts in the city, '
        'or nearby suburbs if the city itself is small],\n'
        '  "housing_notes": "one sentence describing the typical residential housing stock '
        '(eras, common construction types, notable building features) relevant to the brand services",\n'
        '  "climate_notes": "one sentence on local climate factors that affect homeowners '
        'in ways relevant to the brand services (heating/cooling demand, humidity, freeze-thaw, etc.)",\n'
        '  "common_job": "one sentence on the kind of project the brand most often does in this area, '
        'grounded in housing stock and climate",\n'
        '  "local_challenge": "one sentence on a specific challenge homeowners in this area face '
        'that the brand addresses",\n'
        '  "fun_fact": "one short, true, locally-distinctive cultural or geographic detail (a real '
        'landmark, festival, sports team, university, industry, geographic feature, etc.). Skip if not confident."\n'
        '}\n'
        "Do not include markdown fences. Do not include extra keys."
    )

    user = (
        f"City: {req.city}\n"
        f"State: {req.state}\n"
        f"{brand_line}{industry_line}{services_line}"
        "Return the JSON now."
    )

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    try:
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            temperature=0.3,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
    except Exception as e:
        logger.error("Location enrichment failed for %s, %s: %s", req.city, req.state, e)
        raise HTTPException(status_code=502, detail="Enrichment model call failed")

    raw = "".join(b.text for b in response.content if hasattr(b, "text")).strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Enrichment returned non-JSON for %s, %s: %s", req.city, req.state, raw[:200])
        raise HTTPException(status_code=502, detail="Enrichment model returned invalid JSON")

    return {
        "neighborhoods": parsed.get("neighborhoods") or [],
        "housing_notes": parsed.get("housing_notes") or "",
        "climate_notes": parsed.get("climate_notes") or "",
        "common_job": parsed.get("common_job") or "",
        "local_challenge": parsed.get("local_challenge") or "",
        "fun_fact": parsed.get("fun_fact") or "",
    }
