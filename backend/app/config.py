"""Centralized configuration from environment variables."""
from __future__ import annotations
import os

# Auth
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "pulp-dev-secret")
JWT_EXPIRY_DAYS = 7

_DEV_JWT_SECRET = "pulp-dev-secret"


def _validate_auth_config() -> None:
    """Fail fast on insecure auth config unless explicitly running in dev mode.

    Set PULP_DEV=1 to bypass (local development only). On Render the real
    APP_PASSWORD and JWT_SECRET env vars are set, so this never fires there.
    """
    if os.environ.get("PULP_DEV") == "1":
        return
    problems = []
    if not APP_PASSWORD:
        problems.append("APP_PASSWORD is empty")
    if JWT_SECRET == _DEV_JWT_SECRET:
        problems.append("JWT_SECRET is the insecure dev default")
    if problems:
        raise RuntimeError(
            "Refusing to start with insecure auth config: "
            + "; ".join(problems)
            + ". Set APP_PASSWORD and JWT_SECRET environment variables, "
            "or set PULP_DEV=1 for local development."
        )


_validate_auth_config()

# Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

# Anthropic
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# POP
POP_API_KEY = os.environ.get("POP_API_KEY", "")
POP_EXPOSE_URL = "https://app.pageoptimizer.pro/api/expose"
POP_TASK_URL = "https://app.pageoptimizer.pro/api/task"

# Notion
NOTION_API_KEY = os.environ.get("NOTION_API_KEY", "")
NOTION_DATABASE_ID = os.environ.get("NOTION_DATABASE_ID", "")

# Firecrawl
FIRECRAWL_API_KEY = os.environ.get("FIRECRAWL_API_KEY", "")

# DataForSEO
DATAFORSEO_LOGIN = os.environ.get("DATAFORSEO_LOGIN", "")
DATAFORSEO_PASSWORD = os.environ.get("DATAFORSEO_PASSWORD", "")

# Google Drive
GOOGLE_SERVICE_ACCOUNT_KEY = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY", "")
GOOGLE_DRIVE_FOLDER_ID = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")

# Google Places
GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")

# Frontend
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
