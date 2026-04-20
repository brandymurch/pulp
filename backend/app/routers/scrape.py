"""Scrape router - POST /api/scrape."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from app.auth import require_auth
from app.models import ScrapeRequest
from app.services.scraper import scrape_url

router = APIRouter(prefix="/api/scrape", tags=["scrape"])


@router.post("")
async def scrape(req: ScrapeRequest, _=Depends(require_auth)):
    result = await scrape_url(req.url)
    return result
