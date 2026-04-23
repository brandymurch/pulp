"""Pipeline API - start and poll content generation jobs."""
from __future__ import annotations
import logging
import threading
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import require_auth
from app.db import get_db
from app.services.pipeline import run_pipeline, resume_pipeline

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


class StartPipelineRequest(BaseModel):
    keyword: str
    city: str
    state: str = ""
    brand_id: str
    location_id: Optional[str] = None
    template_id: Optional[str] = None
    content_type: str = "landing_page"
    competitor_urls: Optional[list] = None


@router.post("/start")
async def start_pipeline(req: StartPipelineRequest, _=Depends(require_auth)):
    """Start a new pipeline job. Returns pipeline_id to poll."""
    db = get_db()
    result = db.table("pipeline_jobs").insert({
        "keyword": req.keyword,
        "city": req.city,
        "state": req.state,
        "brand_id": req.brand_id,
        "location_id": req.location_id,
        "template_id": req.template_id,
        "content_type": req.content_type,
        "phase": "pending",
    }).execute()

    job = result.data[0]
    job_id = job["id"]

    # Run pipeline in background thread
    thread = threading.Thread(
        target=run_pipeline,
        kwargs={
            "job_id": job_id,
            "keyword": req.keyword,
            "city": req.city,
            "state": req.state,
            "brand_id": req.brand_id,
            "location_id": req.location_id,
            "template_id": req.template_id,
            "content_type": req.content_type,
            "competitor_urls": req.competitor_urls,
        },
        daemon=True,
    )
    thread.start()

    return {"pipeline_id": job_id, "phase": "pending"}


@router.post("/approve/{pipeline_id}")
async def approve_outline(pipeline_id: str, _=Depends(require_auth)):
    """Approve the outline and resume the pipeline."""
    db = get_db()
    try:
        result = db.table("pipeline_jobs").select("phase").eq("id", pipeline_id).single().execute()
        if not result.data or result.data["phase"] != "outline_review":
            raise HTTPException(status_code=400, detail="Pipeline is not waiting for approval")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    # Resume in background thread
    thread = threading.Thread(
        target=resume_pipeline,
        args=(pipeline_id,),
        daemon=True,
    )
    thread.start()

    return {"pipeline_id": pipeline_id, "phase": "generating"}


@router.get("/status/{pipeline_id}")
async def get_pipeline_status(pipeline_id: str, _=Depends(require_auth)):
    """Poll for pipeline job status and results."""
    db = get_db()
    try:
        result = db.table("pipeline_jobs").select("*").eq("id", pipeline_id).single().execute()
    except Exception:
        raise HTTPException(status_code=404, detail="Pipeline job not found")

    job = result.data
    if not job:
        raise HTTPException(status_code=404, detail="Pipeline job not found")

    return {
        "pipeline_id": job["id"],
        "phase": job["phase"],
        "keyword": job["keyword"],
        "city": job["city"],
        "state": job.get("state", ""),
        "brief": job.get("brief"),
        "outline": job.get("outline"),
        "content": job.get("content"),
        "score": job.get("score"),
        "error": job.get("error"),
        "revision_count": job.get("revision_count", 0),
        "word_count": job.get("word_count", 0),
        "input_tokens": job.get("input_tokens", 0),
        "output_tokens": job.get("output_tokens", 0),
        "created_at": job.get("created_at"),
        "updated_at": job.get("updated_at"),
    }


@router.get("/list")
async def list_pipelines(brand_id: Optional[str] = None, limit: int = 20, _=Depends(require_auth)):
    """List recent pipeline jobs. Optionally filter by brand."""
    db = get_db()
    query = db.table("pipeline_jobs").select("id,keyword,city,state,phase,word_count,score,created_at,content_type")
    if brand_id:
        query = query.eq("brand_id", brand_id)
    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data
