"""Firecrawl scraper with in-memory cache."""
from __future__ import annotations
import logging
import re
import time
from typing import Any, Optional
import httpx
from app.config import FIRECRAWL_API_KEY

logger = logging.getLogger(__name__)

CACHE_TTL = 30 * 60  # 30 minutes
MAX_CACHE = 200

_cache: dict[str, dict[str, Any]] = {}


def _evict_cache():
    if len(_cache) <= MAX_CACHE:
        return
    sorted_keys = sorted(_cache, key=lambda k: _cache[k].get("ts", 0))
    for k in sorted_keys[:50]:
        _cache.pop(k, None)


def _get_cached(url: str) -> Optional[dict]:
    entry = _cache.get(url)
    if not entry:
        return None
    if time.time() - entry["ts"] > CACHE_TTL:
        _cache.pop(url, None)
        return None
    return entry["data"]


async def scrape_url(url: str) -> dict[str, Any]:
    cached = _get_cached(url)
    if cached:
        return {**cached, "from_cache": True}

    result = await _firecrawl(url)

    _cache[url] = {"data": result, "ts": time.time()}
    _evict_cache()
    return result


async def _firecrawl(url: str) -> dict[str, Any]:
    if not FIRECRAWL_API_KEY:
        logger.warning("FIRECRAWL_API_KEY not set, returning empty scrape")
        return {
            "url": url, "title": "", "content": "",
            "word_count": 0, "headings": [],
            "source": "error", "scrape_quality": "minimal",
        }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.firecrawl.dev/v1/scrape",
                json={"url": url, "formats": ["markdown"]},
                headers={
                    "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code != 200:
                logger.warning(f"Firecrawl returned {resp.status_code} for {url}")
                return {
                    "url": url, "title": "", "content": "",
                    "word_count": 0, "headings": [],
                    "source": "error", "scrape_quality": "minimal",
                }

            data = resp.json()
            page_data = data.get("data", {})
            content = page_data.get("markdown", "")
            title = page_data.get("metadata", {}).get("title", "")

            headings = [
                {"level": len(m.group(1)), "text": m.group(2)}
                for m in re.finditer(r"^(#{1,6})\s+(.+)$", content, re.MULTILINE)
            ]

            return {
                "url": url,
                "title": title,
                "content": content,
                "word_count": len(content.split()),
                "headings": headings,
                "source": "firecrawl",
                "scrape_quality": "full" if len(content) > 200 else "partial",
            }
    except Exception as e:
        logger.error(f"Firecrawl scrape failed for {url}: {e}")
        return {
            "url": url, "title": "", "content": "",
            "word_count": 0, "headings": [],
            "source": "error", "scrape_quality": "minimal",
        }


async def scrape_urls(urls: list[str]) -> list[dict]:
    import asyncio
    return await asyncio.gather(*(scrape_url(u) for u in urls))
