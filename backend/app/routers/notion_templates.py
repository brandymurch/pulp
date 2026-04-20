"""Notion templates router - GET /api/notion/templates."""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from app.auth import require_auth
from app.services.notion import list_templates, get_template

router = APIRouter(prefix="/api/notion/templates", tags=["notion"])


@router.get("")
async def get_templates(brand: Optional[str] = None, _=Depends(require_auth)):
    try:
        return list_templates(brand=brand)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{page_id}")
async def get_template_detail(page_id: str, _=Depends(require_auth)):
    try:
        return get_template(page_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
