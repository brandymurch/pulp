"""Google Business Profile data via DataForSEO."""
from __future__ import annotations
import base64
import logging
from typing import Any
import httpx
from app.config import DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD

logger = logging.getLogger(__name__)

DATAFORSEO_BASE = "https://api.dataforseo.com/v3"


async def search_google_business(
    business_name: str,
    city: str,
    state: str,
) -> dict[str, Any]:
    """Search for a business on Google and return profile data + reviews."""
    if not DATAFORSEO_LOGIN or not DATAFORSEO_PASSWORD:
        return {"error": "DataForSEO not configured", "results": []}

    creds = base64.b64encode(
        f"{DATAFORSEO_LOGIN}:{DATAFORSEO_PASSWORD}".encode()
    ).decode()
    headers = {
        "Authorization": f"Basic {creds}",
        "Content-Type": "application/json",
    }

    query = f"{business_name} {city} {state}"

    # Use Google Maps SERP to find the business
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{DATAFORSEO_BASE}/serp/google/maps/live/advanced",
            json=[{
                "keyword": query,
                "location_name": "United States",
                "language_name": "English",
                "depth": 5,
            }],
            headers=headers,
        )

    data = resp.json()
    tasks = data.get("tasks", [])
    if not tasks or tasks[0].get("status_code") != 20000:
        error_msg = tasks[0].get("status_message", "Unknown error") if tasks else "No tasks returned"
        logger.error(f"Google Maps search failed: {error_msg}")
        return {"error": error_msg, "results": []}

    results = []
    items = (tasks[0].get("result", [{}])[0] or {}).get("items", []) or []

    for item in items[:5]:
        if item.get("type") != "maps_search":
            continue

        reviews = []
        for r in (item.get("reviews", []) or [])[:10]:
            reviews.append({
                "author": r.get("author", ""),
                "text": r.get("review_text", ""),
                "rating": r.get("rating", {}).get("value", 5) if isinstance(r.get("rating"), dict) else r.get("rating", 5),
            })

        result = {
            "title": item.get("title", ""),
            "address": item.get("address", ""),
            "phone": item.get("phone", ""),
            "rating": item.get("rating", {}).get("value") if isinstance(item.get("rating"), dict) else item.get("rating"),
            "total_reviews": item.get("reviews_count") or item.get("rating", {}).get("votes_count", 0) if isinstance(item.get("rating"), dict) else 0,
            "category": item.get("category", ""),
            "url": item.get("url", ""),
            "reviews": reviews,
        }
        results.append(result)

    return {"results": results}
