"""CRUD routes for style examples."""
from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.auth import require_auth
from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/style-examples", tags=["style-examples"])


class CreateStyleExampleRequest(BaseModel):
    brand_id: str
    title: str = Field(max_length=500)
    content: str = Field(max_length=200_000)
    url: str | None = Field(default=None, max_length=2000)


@router.get("")
def list_examples(brand_id: str, _=Depends(require_auth)):
    db = get_db()
    try:
        result = db.table("style_examples").select("*").eq("brand_id", brand_id).execute()
    except Exception as e:
        logger.error("Style example list failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    return result.data


@router.post("")
def create_example(req: CreateStyleExampleRequest, _=Depends(require_auth)):
    db = get_db()
    data = req.model_dump(exclude_none=True)
    data["word_count"] = len(req.content.split())
    try:
        result = db.table("style_examples").insert(data).execute()
    except Exception as e:
        logger.error("Style example create failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    return result.data[0]


@router.delete("/{example_id}")
def delete_example(example_id: str, _=Depends(require_auth)):
    db = get_db()
    try:
        db.table("style_examples").delete().eq("id", example_id).execute()
    except Exception as e:
        logger.error("Style example delete failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error")
    return {"ok": True}
