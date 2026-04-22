"""Google Business Profile data via DataForSEO."""
from __future__ import annotations
import base64
import logging
from typing import Any
import httpx
from app.config import DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD

logger = logging.getLogger(__name__)

DATAFORSEO_BASE = "https://api.dataforseo.com/v3"


def _get_headers() -> dict:
    creds = base64.b64encode(
        f"{DATAFORSEO_LOGIN}:{DATAFORSEO_PASSWORD}".encode()
    ).decode()
    return {
        "Authorization": f"Basic {creds}",
        "Content-Type": "application/json",
    }


async def _fetch_reviews(place_id: str, headers: dict) -> list[dict]:
    """Fetch reviews for a specific Google place using DataForSEO."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{DATAFORSEO_BASE}/business_data/google/reviews/live",
                json=[{
                    "keyword": place_id,
                    "depth": 10,
                    "sort_by": "highest_rating",
                }],
                headers=headers,
            )
        data = resp.json()
        tasks = data.get("tasks", [])
        if not tasks or tasks[0].get("status_code") != 20000:
            return []

        items = (tasks[0].get("result", [{}])[0] or {}).get("items", []) or []
        reviews = []
        for item in items:
            text = item.get("review_text") or item.get("original_review_text") or ""
            if not text or len(text) < 20:
                continue
            reviews.append({
                "author": item.get("profile_name") or item.get("author") or "Customer",
                "text": text,
                "rating": item.get("rating", {}).get("value", 5) if isinstance(item.get("rating"), dict) else item.get("rating", 5),
            })
        return reviews[:10]
    except Exception as e:
        logger.warning(f"Failed to fetch reviews: {e}")
        return []


async def search_google_business(
    business_name: str,
    city: str,
    state: str,
) -> dict[str, Any]:
    """Search for a business on Google and return profile data + reviews."""
    if not DATAFORSEO_LOGIN or not DATAFORSEO_PASSWORD:
        return {"error": "DataForSEO not configured", "results": []}

    headers = _get_headers()
    query = f"{business_name} {city} {state}"

    # Step 1: Find the business on Google Maps
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

    for item in items[:3]:
        if item.get("type") != "maps_search":
            continue

        # Extract place_id or cid for review lookup
        place_id = item.get("place_id") or item.get("cid") or ""
        rating_data = item.get("rating") or {}
        if isinstance(rating_data, dict):
            rating_val = rating_data.get("value")
            review_count = rating_data.get("votes_count", 0)
        else:
            rating_val = rating_data
            review_count = item.get("reviews_count", 0)

        # Step 2: Fetch actual reviews if we have a place_id
        reviews = []
        if place_id:
            reviews = await _fetch_reviews(place_id, headers)

        result = {
            "title": item.get("title", ""),
            "address": item.get("address", ""),
            "phone": item.get("phone", ""),
            "rating": rating_val,
            "total_reviews": review_count,
            "category": item.get("category", ""),
            "url": item.get("url", ""),
            "place_id": place_id,
            "reviews": reviews,
        }
        results.append(result)

    return {"results": results}
