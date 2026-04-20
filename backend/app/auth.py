"""JWT authentication - password gate."""
from __future__ import annotations
import datetime
import jwt
from fastapi import HTTPException, Request
from app.config import APP_PASSWORD, JWT_SECRET, JWT_EXPIRY_DAYS


def create_token() -> str:
    payload = {
        "authenticated": True,
        "exp": datetime.datetime.now(datetime.timezone.utc)
        + datetime.timedelta(days=JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def verify_password(password: str) -> bool:
    return password == APP_PASSWORD


def require_auth(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth_header[7:]
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
