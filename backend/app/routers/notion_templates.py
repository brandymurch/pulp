"""Notion templates router - GET /api/notion/templates."""
from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, HTTPException
from app.auth import require_auth
from app.services.notion import list_templates, get_template

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/notion/templates", tags=["notion"])


@router.get("")
async def get_templates(brand: str | None = None, _=Depends(require_auth)):
    try:
        return list_templates(brand=brand)
    except Exception as e:
        logger.error("Notion list_templates failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail=f"Notion error: {str(e)}")


@router.get("/{page_id}")
async def get_template_detail(page_id: str, _=Depends(require_auth)):
    try:
        return get_template(page_id)
    except Exception as e:
        logger.error("Notion get_template failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail=f"Notion error: {str(e)}")
