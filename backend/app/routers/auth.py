"""Auth router - login endpoint."""
from __future__ import annotations
import logging
import threading
import time

from fastapi import APIRouter, HTTPException, Request

from app.auth import create_token, verify_password
from app.models import LoginRequest, LoginResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Simple in-memory login throttle: per-IP failure timestamps.
_MAX_FAILURES = 10
_WINDOW_SECONDS = 15 * 60
_failures: dict[str, list[float]] = {}
_failures_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _prune(now: float) -> None:
    """Drop failure timestamps outside the window; remove empty entries."""
    cutoff = now - _WINDOW_SECONDS
    for ip in list(_failures.keys()):
        recent = [t for t in _failures[ip] if t > cutoff]
        if recent:
            _failures[ip] = recent
        else:
            del _failures[ip]


def _is_throttled(ip: str) -> bool:
    now = time.time()
    with _failures_lock:
        _prune(now)
        return len(_failures.get(ip, [])) >= _MAX_FAILURES


def _record_failure(ip: str) -> None:
    now = time.time()
    with _failures_lock:
        _prune(now)
        _failures.setdefault(ip, []).append(now)


def _clear_failures(ip: str) -> None:
    with _failures_lock:
        _failures.pop(ip, None)


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, request: Request):
    """Authenticate with app password, receive JWT."""
    ip = _client_ip(request)
    if _is_throttled(ip):
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Try again in 15 minutes.",
        )
    if not verify_password(req.password):
        _record_failure(ip)
        raise HTTPException(status_code=401, detail="Invalid password")
    _clear_failures(ip)
    token = create_token()
    return LoginResponse(token=token)
