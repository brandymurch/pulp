"""DataForSEO SERP client for PAA questions."""
from __future__ import annotations
import base64
import logging
from typing import Any
import httpx
from app.config import DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD

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

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            SERP_URL,
            json=payload,
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type": "application/json",
            },
        )
        data = resp.json()

    tasks = data.get("tasks", [])
    if not tasks or tasks[0].get("status_code") != 20000:
        logger.error(
            f"DataForSEO error: {tasks[0].get('status_message') if tasks else 'no tasks'}"
        )
        return {
            "keyword": keyword,
            "organic_results": [],
            "paa_questions": [],
            "related_searches": [],
            "ai_fanout_queries": [],
        }

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

    for it in items:
        if it.get("type") == "people_also_ask":
            paa.extend(
                sub.get("title", "")
                for sub in (it.get("items") or [])
                if sub.get("title")
            )
        elif it.get("type") == "related_searches":
            related.extend(
                sub.get("title", "")
                for sub in (it.get("items") or [])
                if sub.get("title")
            )
        elif it.get("type") in ("ai_overview", "ai_overview_element"):
            if it.get("type") == "ai_overview_element":
                ai_queries.append(it.get("title", ""))
            for sub in it.get("items") or []:
                if sub.get("type") == "ai_overview_element" and sub.get("title"):
                    ai_queries.append(sub["title"])

    return {
        "keyword": keyword,
        "organic_results": organic,
        "paa_questions": paa,
        "related_searches": related,
        "ai_fanout_queries": ai_queries,
    }
