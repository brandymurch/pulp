"""Supabase client singleton."""
from __future__ import annotations
import logging
from supabase import create_client, Client
from app.config import SUPABASE_URL, SUPABASE_ANON_KEY

logger = logging.getLogger(__name__)
_client: Client | None = None


def get_db() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            logger.warning("SUPABASE_URL or SUPABASE_ANON_KEY not set")
            raise RuntimeError("Supabase not configured")
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return _client
