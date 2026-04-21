"""Brief router - POP optimization brief endpoint.

Uses async task pattern to avoid Render's 30s request timeout.
POST /api/brief starts the POP task, returns a job_id.
GET /api/brief/status/:job_id polls for the result.
"""
from __future__ import annotations
import asyncio
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_auth
from app.config import POP_API_KEY
from app.models import BriefRequest
from app.services.pop import get_enriched_brief

logger = logging.getLogger(__name__)

router = APIRouter(tags=["brief"])

# In-memory job store (adequate for single-instance Render starter plan)
_jobs: dict[str, dict[str, Any]] = {}


async def _run_brief_job(job_id: str, keyword: str, target_url: str, location: str):
    """Run the POP brief in the background and store result."""
    try:
        result = await get_enriched_brief(
            keyword=keyword,
            target_url=target_url,
            location_name=location,
        )
        _jobs[job_id] = {"status": "done", "result": result}
    except Exception as e:
        logger.error(f"Brief job {job_id} failed: {e}")
        _jobs[job_id] = {"status": "error", "error": str(e)}


@router.post("/api/brief")
async def create_brief(req: BriefRequest, _auth: dict = Depends(require_auth)):
    """Start a POP brief job. Returns job_id to poll for results."""
    if not POP_API_KEY:
        raise HTTPException(status_code=503, detail="POP_API_KEY not configured")

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "pending"}

    # Fire and forget - runs in the background
    asyncio.create_task(_run_brief_job(
        job_id=job_id,
        keyword=req.keyword,
        target_url=req.target_url or "",
        location=req.location or "",
    ))

    return {"job_id": job_id, "status": "pending"}


@router.get("/api/brief/status/{job_id}")
async def get_brief_status(job_id: str, _auth: dict = Depends(require_auth)):
    """Poll for brief job result."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] == "pending":
        return {"status": "pending"}

    if job["status"] == "error":
        # Clean up
        _jobs.pop(job_id, None)
        raise HTTPException(status_code=500, detail=job["error"])

    if job["status"] == "done":
        result = job["result"]
        # Clean up
        _jobs.pop(job_id, None)
        return {
            "status": "done",
            "target_word_count": result["target_word_count"],
            "term_targets": result["term_targets"],
            "lsa_phrases": result["lsa_phrases"],
        }

    return {"status": "unknown"}
