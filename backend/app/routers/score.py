"""Score router - content scoring endpoint.

Uses background thread pattern (same as brief) to avoid Render 30s timeout.
POST /api/score starts the job, returns job_id.
GET /api/score/status/:job_id polls for the result.
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
from app.models import ScoreRequest
from app.services.pop import score_content_with_pop, stub_score

logger = logging.getLogger(__name__)

router = APIRouter(tags=["score"])

_score_jobs: dict[str, dict[str, Any]] = {}


def _run_score_job_sync(job_id: str, content: str, keyword: str, target_url: str):
    """Run POP scoring in a background thread."""
    loop = asyncio.new_event_loop()
    try:
        if POP_API_KEY:
            result = loop.run_until_complete(score_content_with_pop(
                content=content,
                target_keyword=keyword,
                url=target_url,
            ))
        else:
            result = stub_score(content=content, target_keyword=keyword)
        _score_jobs[job_id] = {"status": "done", "result": result}
    except Exception as e:
        logger.error(f"Score job {job_id} failed: {e}")
        _score_jobs[job_id] = {"status": "error", "error": str(e)}
    finally:
        loop.close()


@router.post("/api/score")
async def score_content(req: ScoreRequest, _auth: dict = Depends(require_auth)):
    """Start a scoring job. Returns job_id to poll for results."""
    job_id = str(uuid.uuid4())
    _score_jobs[job_id] = {"status": "pending"}

    thread = threading.Thread(
        target=_run_score_job_sync,
        args=(job_id, req.content, req.keyword, req.target_url or ""),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id, "status": "pending"}


@router.get("/api/score/status/{job_id}")
async def get_score_status(job_id: str, _auth: dict = Depends(require_auth)):
    """Poll for score job result."""
    job = _score_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] == "pending":
        return {"status": "pending"}

    if job["status"] == "error":
        _score_jobs.pop(job_id, None)
        raise HTTPException(status_code=500, detail=job["error"])

    if job["status"] == "done":
        result = job["result"]
        _score_jobs.pop(job_id, None)
        return {"status": "done", **result}

    return {"status": "unknown"}
