"""CRUD routes for style examples."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.auth import require_auth
from app.db import get_db

router = APIRouter(prefix="/api/style-examples", tags=["style-examples"])


class CreateStyleExampleRequest(BaseModel):
    brand_id: str
    title: str
    content: str
    url: str | None = None


@router.get("")
async def list_examples(brand_id: str, _=Depends(require_auth)):
    db = get_db()
    result = db.table("style_examples").select("*").eq("brand_id", brand_id).execute()
    return result.data


@router.post("")
async def create_example(req: CreateStyleExampleRequest, _=Depends(require_auth)):
    db = get_db()
    data = req.model_dump(exclude_none=True)
    data["word_count"] = len(req.content.split())
    result = db.table("style_examples").insert(data).execute()
    return result.data[0]


@router.delete("/{example_id}")
async def delete_example(example_id: str, _=Depends(require_auth)):
    db = get_db()
    db.table("style_examples").delete().eq("id", example_id).execute()
    return {"ok": True}
