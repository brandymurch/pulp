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


async def _fetch_reviews_firecrawl(business_name: str, city: str, state: str) -> list[dict]:
    """Fetch reviews by scraping Google search results via Firecrawl."""
    from app.config import FIRECRAWL_API_KEY
    if not FIRECRAWL_API_KEY:
        return []

    try:
        search_url = f"https://www.google.com/search?q={business_name}+{city}+{state}+reviews"
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.firecrawl.dev/v1/scrape",
                json={"url": search_url, "formats": ["markdown"]},
                headers={
                    "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code != 200:
                return []

            data = resp.json()
            content = data.get("data", {}).get("markdown", "")

        # Parse review-like content from the scraped page
        import re
        reviews = []
        # Look for patterns like "★★★★★" or star ratings followed by review text
        # Also look for quoted text that looks like reviews
        lines = content.split("\n")
        for i, line in enumerate(lines):
            line = line.strip()
            if not line or len(line) < 30:
                continue
            # Skip navigation, headers, etc.
            if line.startswith("#") or line.startswith("[") or line.startswith("!"):
                continue
            # Look for lines that contain star ratings or look like review snippets
            star_match = re.search(r"(\d(?:\.\d)?)\s*/\s*5|(\d(?:\.\d)?)\s*star|★{3,5}", line)
            if star_match and len(line) > 40:
                rating = 5
                if star_match.group(1):
                    rating = int(float(star_match.group(1)))
                elif star_match.group(2):
                    rating = int(float(star_match.group(2)))
                # Clean the review text
                text = re.sub(r"★+|\d+(\.\d+)?\s*/\s*5|\d+(\.\d+)?\s*star(s)?", "", line).strip()
                text = re.sub(r"^\W+|\W+$", "", text)
                if len(text) > 20:
                    reviews.append({"author": "Google Reviewer", "text": text, "rating": min(rating, 5)})

        return reviews[:10]
    except Exception as e:
        logger.warning(f"Firecrawl review scrape failed: {e}")
        return []


async def _fetch_reviews_dataforseo(business_name: str, city: str, state: str, place_id: str, headers: dict) -> list[dict]:
    """Try fetching reviews via DataForSEO business data API."""
    try:
        payload = {
            "keyword": f"{business_name} {city} {state}",
            "depth": 10,
            "sort_by": "highest_rating",
            "location_name": "United States",
            "language_name": "English",
        }
        if place_id:
            payload["place_id"] = place_id

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{DATAFORSEO_BASE}/business_data/google/reviews/live",
                json=[payload],
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
        logger.warning(f"DataForSEO reviews failed: {e}")
        return []


async def _fetch_reviews(business_name: str, city: str, state: str, place_id: str, headers: dict) -> list[dict]:
    """Try DataForSEO first, fall back to Firecrawl scraping."""
    reviews = await _fetch_reviews_dataforseo(business_name, city, state, place_id, headers)
    if reviews:
        return reviews
    return await _fetch_reviews_firecrawl(business_name, city, state)


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

        # Step 2: Fetch actual reviews
        reviews = await _fetch_reviews(business_name, city, state, place_id, headers)

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
