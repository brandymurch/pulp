"""Auth router - login endpoint."""
from __future__ import annotations
import logging

from fastapi import APIRouter, HTTPException

from app.auth import create_token, verify_password
from app.models import LoginRequest, LoginResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """Authenticate with app password, receive JWT."""
    if not verify_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_token()
    return LoginResponse(token=token)
