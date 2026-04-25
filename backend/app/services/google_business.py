"""Google Business Profile data via Google Places API."""
from __future__ import annotations
import logging
from typing import Any
import httpx
from app.config import GOOGLE_PLACES_API_KEY

logger = logging.getLogger(__name__)

PLACES_BASE = "https://places.googleapis.com/v1"


async def search_google_business(
    business_name: str,
    city: str,
    state: str,
) -> dict[str, Any]:
    """Search for a business on Google and return profile data + reviews."""
    if not GOOGLE_PLACES_API_KEY:
        return {"error": "GOOGLE_PLACES_API_KEY not configured", "results": []}

    query = f"{business_name} {city} {state}"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.primaryType,places.websiteUri,places.reviews",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: Text search to find the business
        resp = await client.post(
            f"{PLACES_BASE}/places:searchText",
            json={"textQuery": query, "maxResultCount": 3},
            headers=headers,
        )

    if resp.status_code != 200:
        logger.error("Places API search failed: %s %s", resp.status_code, resp.text[:200])
        return {"error": f"Places API error: {resp.status_code}", "results": []}

    data = resp.json()
    places = data.get("places", [])

    results = []
    for place in places[:3]:
        reviews = []
        for r in (place.get("reviews") or []):
            text = (r.get("text") or {}).get("text", "")
            author = (r.get("authorAttribution") or {}).get("displayName", "Customer")
            rating = r.get("rating", 5)
            # Only import 5-star reviews for content reference
            if text and len(text) > 15 and rating == 5:
                reviews.append({
                    "author": author,
                    "text": text,
                    "rating": rating,
                })
                if len(reviews) >= 10:
                    break

        display_name = place.get("displayName", {})
        result = {
            "title": display_name.get("text", "") if isinstance(display_name, dict) else str(display_name),
            "address": place.get("formattedAddress", ""),
            "phone": place.get("nationalPhoneNumber", ""),
            "rating": place.get("rating"),
            "total_reviews": place.get("userRatingCount", 0),
            "category": place.get("primaryType", ""),
            "url": place.get("websiteUri", ""),
            "place_id": place.get("id", ""),
            "reviews": reviews,
        }
        results.append(result)

    return {"results": results}
