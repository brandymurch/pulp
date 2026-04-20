"""Jina Reader scraper with BeautifulSoup fallback and in-memory cache."""
from __future__ import annotations
import logging
import re
import time
from typing import Any, Optional
import httpx
from bs4 import BeautifulSoup
from app.config import JINA_API_KEY

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

    result = await _try_jina(url)
    if not result or len(result.get("content", "")) < 100:
        result = await _try_beautifulsoup(url)

    _cache[url] = {"data": result, "ts": time.time()}
    _evict_cache()
    return result


async def _try_jina(url: str) -> Optional[dict]:
    try:
        headers = {"Accept": "application/json"}
        if JINA_API_KEY:
            headers["Authorization"] = f"Bearer {JINA_API_KEY}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"https://r.jina.ai/{url}", headers=headers)
            if resp.status_code != 200:
                return None
            data = (
                resp.json()
                if resp.headers.get("content-type", "").startswith("application/json")
                else {"content": resp.text}
            )
            content = data.get("content") or data.get("text", "")
            title = data.get("title", "")
            headings = re.findall(r"^#{1,6}\s+(.+)$", content, re.MULTILINE)
            return {
                "url": url,
                "title": title,
                "content": content,
                "word_count": len(content.split()),
                "headings": [{"level": 0, "text": h} for h in headings],
                "source": "jina",
                "scrape_quality": "full",
            }
    except Exception as e:
        logger.warning(f"Jina scrape failed for {url}: {e}")
        return None


async def _try_beautifulsoup(url: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; PulpBot/1.0)"},
            )
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()
            title = soup.title.string if soup.title else ""
            body_el = (
                soup.find("article")
                or soup.find("main")
                or soup.find(class_="content")
                or soup.body
            )
            text = body_el.get_text(separator="\n", strip=True) if body_el else ""
            headings = [
                {"level": int(h.name[1]), "text": h.get_text(strip=True)}
                for h in soup.find_all(re.compile(r"^h[1-6]$"))
            ]
            quality = "partial" if len(text) > 200 else "minimal"
            return {
                "url": url,
                "title": title or "",
                "content": text,
                "word_count": len(text.split()),
                "headings": headings,
                "source": "beautifulsoup",
                "scrape_quality": quality,
            }
    except Exception as e:
        logger.error(f"BeautifulSoup scrape failed for {url}: {e}")
        return {
            "url": url,
            "title": "",
            "content": "",
            "word_count": 0,
            "headings": [],
            "source": "error",
            "scrape_quality": "minimal",
        }


async def scrape_urls(urls: list[str]) -> list[dict]:
    import asyncio

    return await asyncio.gather(*(scrape_url(u) for u in urls))
