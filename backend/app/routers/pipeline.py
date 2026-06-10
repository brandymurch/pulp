"""Pipeline API - start and poll content generation jobs."""
from __future__ import annotations
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import require_auth
from app.db import get_db
from app.services.pipeline import run_pipeline, resume_pipeline

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

# Phases where a worker thread should be actively making progress. If a job
# sits in one of these with no updated_at movement for STALE_AFTER, the
# worker is gone (server restart, killed dyno) and the job will never finish.
ACTIVE_PHASES = {"pending", "brief", "research", "outline", "generating", "scoring", "revising"}
STALE_AFTER = timedelta(minutes=12)
STALE_ERROR = "Job timed out - the server may have restarted. Please start again."


class StartPipelineRequest(BaseModel):
    keyword: str
    city: str
    state: str = ""
    brand_id: str
    location_id: str | None = None
    template_id: str | None = None
    content_type: str = "landing_page"
    competitor_urls: list | None = None
    feedback: str | None = None


class ApproveRequest(BaseModel):
    """Optional approve body: outline-review notes merged into the stored feedback."""
    feedback: str | None = None


def _parse_ts(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        ts = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts
    except ValueError:
        return None


def _sweep_if_stale(db, job: dict) -> dict:
    """If an active-phase job has not been touched in STALE_AFTER, mark it as
    error (conditionally, so a live worker is never clobbered) and return the
    updated shape."""
    phase = job.get("phase")
    if phase not in ACTIVE_PHASES:
        return job
    ts = _parse_ts(job.get("updated_at")) or _parse_ts(job.get("created_at"))
    if ts is None or datetime.now(timezone.utc) - ts < STALE_AFTER:
        return job
    try:
        result = (
            db.table("pipeline_jobs")
            .update({"phase": "error", "error": STALE_ERROR, "updated_at": "now()"})
            .eq("id", job["id"])
            .eq("phase", phase)  # only if still stuck in the same phase
            .execute()
        )
        if result.data:
            job = dict(job)
            job["phase"] = "error"
            job["error"] = STALE_ERROR
    except Exception as e:
        logger.warning("Stale sweep failed for job %s: %s", job.get("id"), e)
    return job


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
            "feedback": req.feedback,
        },
        daemon=True,
    )
    thread.start()

    return {"pipeline_id": job_id, "phase": "pending"}


@router.post("/approve/{pipeline_id}")
async def approve_outline(
    pipeline_id: str,
    req: Optional[ApproveRequest] = None,
    _=Depends(require_auth),
):
    """Approve the outline and resume the pipeline.

    Atomically flips the phase from 'outline_review' to 'generating' BEFORE
    spawning the worker thread, so a double-click cannot start two
    generations: the second request matches zero rows and gets a 409.
    """
    db = get_db()
    try:
        result = (
            db.table("pipeline_jobs")
            .update({"phase": "generating", "updated_at": "now()"})
            .eq("id", pipeline_id)
            .eq("phase", "outline_review")
            .execute()
        )
    except Exception as e:
        logger.error("Approve failed for pipeline %s: %s", pipeline_id, e)
        raise HTTPException(status_code=503, detail=f"Database error: {e}")

    if not result.data:
        # Distinguish "no such job" from "not awaiting approval".
        try:
            check = db.table("pipeline_jobs").select("id,phase").eq("id", pipeline_id).execute()
        except Exception:
            check = None
        rows = (check.data if check else None) or []
        if not rows:
            raise HTTPException(status_code=404, detail="Pipeline not found")
        raise HTTPException(
            status_code=409,
            detail=f"Pipeline is not waiting for approval (phase: {rows[0].get('phase')})",
        )

    # Resume in background thread, merging any outline-review notes into the
    # feedback persisted at the pause.
    approval_feedback = (req.feedback or "").strip() if req else ""
    thread = threading.Thread(
        target=resume_pipeline,
        args=(pipeline_id, approval_feedback or None),
        daemon=True,
    )
    thread.start()

    return {"pipeline_id": pipeline_id, "phase": "generating"}


@router.get("/status/{pipeline_id}")
async def get_pipeline_status(pipeline_id: str, _=Depends(require_auth)):
    """Poll for pipeline job status and results."""
    db = get_db()
    try:
        result = db.table("pipeline_jobs").select("*").eq("id", pipeline_id).execute()
    except Exception as e:
        # A malformed id is a client problem; anything else is upstream.
        if "invalid input syntax" in str(e).lower():
            raise HTTPException(status_code=404, detail="Pipeline job not found")
        logger.error("Status lookup failed for pipeline %s: %s", pipeline_id, e)
        raise HTTPException(status_code=503, detail="Database unavailable, try again shortly")

    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Pipeline job not found")

    job = _sweep_if_stale(db, rows[0])

    return {
        "pipeline_id": job["id"],
        "brand_id": job.get("brand_id", ""),
        "location_id": job.get("location_id"),
        "phase": job["phase"],
        "keyword": job["keyword"],
        "city": job["city"],
        "state": job.get("state", ""),
        "brief": job.get("brief"),
        "research": job.get("research"),
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
async def list_pipelines(brand_id: str | None = None, limit: int = 20, _=Depends(require_auth)):
    """List recent pipeline jobs. Optionally filter by brand."""
    db = get_db()
    query = db.table("pipeline_jobs").select(
        "id,keyword,city,state,phase,word_count,score,created_at,updated_at,content_type"
    )
    if brand_id:
        query = query.eq("brand_id", brand_id)
    try:
        result = query.order("created_at", desc=True).limit(limit).execute()
    except Exception as e:
        logger.error("Pipeline list failed: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable, try again shortly")
    return [_sweep_if_stale(db, job) for job in (result.data or [])]


@router.delete("/{pipeline_id}")
async def delete_pipeline(pipeline_id: str, _=Depends(require_auth)):
    """Delete a pipeline job."""
    db = get_db()
    db.table("pipeline_jobs").delete().eq("id", pipeline_id).execute()
    return {"ok": True}
