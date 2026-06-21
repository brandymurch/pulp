"""DataForSEO SERP client for PAA questions."""
from __future__ import annotations
import base64
import logging
from typing import Any
import httpx
from app.config import DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
from app.services.dataforseo_labs import DataForSeoError, post_with_retry

logger = logging.getLogger(__name__)

SERP_URL = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced"


async def get_serp_results(
    keyword: str, location: str = "United States"
) -> dict[str, Any]:
    if not DATAFORSEO_LOGIN or not DATAFORSEO_PASSWORD:
        return {
            "keyword": keyword,
            "organic_results": [],
            "paa_questions": [],
            "related_searches": [],
            "ai_fanout_queries": [],
        }

    creds = base64.b64encode(
        f"{DATAFORSEO_LOGIN}:{DATAFORSEO_PASSWORD}".encode()
    ).decode()
    payload = [
        {
            "keyword": keyword,
            "location_name": location,
            "language_name": "English",
            "depth": 10,
        }
    ]

    resp = await post_with_retry(
        SERP_URL,
        json=payload,
        headers={
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/json",
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise DataForSeoError(
            f"DataForSEO SERP HTTP {resp.status_code}: {resp.text[:300]}"
        )
    data = resp.json()

    tasks = data.get("tasks", [])
    if not tasks or tasks[0].get("status_code") != 20000:
        # Non-20000 task status (auth/quota/429/etc). RAISE so callers do not
        # silently build on zero SERP evidence — every caller catches this and
        # degrades gracefully.
        raise DataForSeoError(
            "DataForSEO SERP task error: "
            f"{tasks[0].get('status_message') if tasks else 'no tasks'}"
        )

    result = tasks[0].get("result", [{}])[0]
    items = result.get("items") or []

    organic = [
        {
            "position": it.get("rank_absolute"),
            "title": it.get("title", ""),
            "url": it.get("url", ""),
            "description": it.get("description", ""),
        }
        for it in items
        if it.get("type") == "organic"
    ][:10]

    paa: list[str] = []
    related: list[str] = []
    ai_queries: list[str] = []

    def _sub_title(sub: Any) -> str:
        # DataForSEO sub-items are dicts for most elements, but plain strings
        # for related_searches (and occasionally elsewhere).
        if isinstance(sub, str):
            return sub
        if isinstance(sub, dict):
            return sub.get("title") or ""
        return ""

    for it in items:
        if it.get("type") == "people_also_ask":
            paa.extend(
                t for t in (_sub_title(sub) for sub in (it.get("items") or [])) if t
            )
        elif it.get("type") == "related_searches":
            related.extend(
                t for t in (_sub_title(sub) for sub in (it.get("items") or [])) if t
            )
        elif it.get("type") in ("ai_overview", "ai_overview_element"):
            if it.get("type") == "ai_overview_element":
                ai_queries.append(it.get("title", ""))
            for sub in it.get("items") or []:
                if isinstance(sub, dict) and sub.get("type") == "ai_overview_element" and sub.get("title"):
                    ai_queries.append(sub["title"])

    return {
        "keyword": keyword,
        "organic_results": organic,
        "paa_questions": paa,
        "related_searches": related,
        "ai_fanout_queries": ai_queries,
    }
