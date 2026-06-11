"""DataForSEO Labs - keyword research data."""
from __future__ import annotations
import base64
import logging

import httpx

from app.config import DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD

logger = logging.getLogger(__name__)

KEYWORD_IDEAS_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live"


class DataForSeoError(RuntimeError):
    pass


def parse_keyword_ideas(data: dict) -> list[dict]:
    """Pure parser - extract [{keyword, volume, competition_level}] from a live response."""
    tasks = data.get("tasks") or []
    if not tasks or (tasks[0].get("status_code") or 0) >= 40000:
        raise DataForSeoError(
            f"DataForSEO task error: {tasks[0].get('status_message') if tasks else 'no tasks'}"
        )
    items = ((tasks[0].get("result") or [{}])[0] or {}).get("items") or []
    out = []
    for it in items:
        info = it.get("keyword_info") or {}
        kw = it.get("keyword")
        vol = info.get("search_volume")
        if kw and vol is not None:
            out.append({
                "keyword": kw,
                "volume": vol,
                "competition_level": info.get("competition_level"),
            })
    out.sort(key=lambda x: x["volume"], reverse=True)
    return out


async def keyword_ideas(
    seeds: list[str],
    location_name: str = "United States",
    limit: int = 300,
) -> list[dict]:
    """Return [{keyword, volume, competition_level}] for seed keywords, sorted by volume desc."""
    if not DATAFORSEO_LOGIN or not DATAFORSEO_PASSWORD:
        raise DataForSeoError(
            "DataForSEO credentials missing - set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD"
        )
    auth = base64.b64encode(f"{DATAFORSEO_LOGIN}:{DATAFORSEO_PASSWORD}".encode()).decode()
    payload = [{
        "keywords": seeds[:200],
        "location_name": location_name,
        "language_name": "English",
        "limit": limit,
    }]
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            KEYWORD_IDEAS_URL,
            json=payload,
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/json",
            },
        )
    if resp.status_code != 200:
        raise DataForSeoError(f"DataForSEO HTTP {resp.status_code}: {resp.text[:300]}")
    return parse_keyword_ideas(resp.json())
