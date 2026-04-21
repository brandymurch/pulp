"""Brief router - POP optimization brief endpoint.

Uses background thread pattern to avoid Render's 30s request timeout.
POST /api/brief starts the POP task, returns a job_id.
GET /api/brief/status/:job_id polls for the result.
"""
from __future__ import annotations
import asyncio
import logging
import threading
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_auth
from app.config import POP_API_KEY
from app.models import BriefRequest
from app.services.pop import get_enriched_brief

logger = logging.getLogger(__name__)

router = APIRouter(tags=["brief"])

# In-memory job store
_jobs: dict[str, dict[str, Any]] = {}


def _run_brief_job_sync(job_id: str, keyword: str, target_url: str, location: str):
    """Run the POP brief in a background thread with its own event loop."""
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(get_enriched_brief(
            keyword=keyword,
            target_url=target_url,
            location_name=location,
        ))
        _jobs[job_id] = {"status": "done", "result": result}
    except Exception as e:
        logger.error(f"Brief job {job_id} failed: {e}")
        _jobs[job_id] = {"status": "error", "error": str(e)}
    finally:
        loop.close()


@router.post("/api/brief")
async def create_brief(req: BriefRequest, _auth: dict = Depends(require_auth)):
    """Start a POP brief job. Returns job_id to poll for results."""
    if not POP_API_KEY:
        raise HTTPException(status_code=503, detail="POP_API_KEY not configured")

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "pending"}

    # Run in a background thread so it survives the request lifecycle
    thread = threading.Thread(
        target=_run_brief_job_sync,
        args=(job_id, req.keyword, req.target_url or "", req.location or ""),
        daemon=True,
    )
    thread.start()

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
        _jobs.pop(job_id, None)
        raise HTTPException(status_code=500, detail=job["error"])

    if job["status"] == "done":
        result = job["result"]
        _jobs.pop(job_id, None)
        return {
            "status": "done",
            **result,
        }

    return {"status": "unknown"}
