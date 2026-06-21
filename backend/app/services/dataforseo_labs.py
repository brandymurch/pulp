"""DataForSEO Labs - keyword research data."""
from __future__ import annotations
import asyncio
import base64
import logging

import httpx

from app.config import DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD

logger = logging.getLogger(__name__)

KEYWORD_IDEAS_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live"

# Shared retry policy for DataForSEO HTTP POSTs (Labs + SERP).
_RETRY_ATTEMPTS = 3
_RETRY_BACKOFF = (1, 2)  # seconds before retry 2 and retry 3


class DataForSeoError(RuntimeError):
    pass


async def post_with_retry(
    url: str,
    *,
    json: object,
    headers: dict,
    timeout: float = 60,
) -> httpx.Response:
    """POST with retry on transient failures (HTTP 429/5xx + transport errors).

    Retries up to 3 attempts with exponential backoff (1s, 2s). Non-transient
    HTTP statuses (e.g. 200, 4xx other than 429) are returned to the caller as-is
    so the caller's existing status handling applies. Dependency-free.
    """
    last_exc: Exception | None = None
    for attempt in range(_RETRY_ATTEMPTS):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, json=json, headers=headers)
        except httpx.TransportError as exc:
            last_exc = exc
            logger.warning(
                "DataForSEO POST transport error (attempt %d/%d): %s",
                attempt + 1, _RETRY_ATTEMPTS, exc,
            )
        else:
            if resp.status_code == 429 or resp.status_code >= 500:
                if attempt < _RETRY_ATTEMPTS - 1:
                    logger.warning(
                        "DataForSEO POST HTTP %d (attempt %d/%d), retrying",
                        resp.status_code, attempt + 1, _RETRY_ATTEMPTS,
                    )
                else:
                    return resp
            else:
                return resp
        if attempt < _RETRY_ATTEMPTS - 1:
            await asyncio.sleep(_RETRY_BACKOFF[attempt])
    # Exhausted retries on a transport error path with no response to return.
    raise DataForSeoError(f"DataForSEO request failed after retries: {last_exc}")


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
    resp = await post_with_retry(
        KEYWORD_IDEAS_URL,
        json=payload,
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/json",
        },
        timeout=60,
    )
    if resp.status_code != 200:
        raise DataForSeoError(f"DataForSEO HTTP {resp.status_code}: {resp.text[:300]}")
    return parse_keyword_ideas(resp.json())
