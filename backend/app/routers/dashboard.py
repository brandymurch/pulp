"""Dashboard stats endpoint."""
from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from app.auth import require_auth
from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_dashboard_stats(brand_id: str | None = None, _=Depends(require_auth)):
    """Return aggregated stats for the overview dashboard. If no brand_id, aggregates all brands."""
    db = get_db()

    # Fetch locations
    loc_query = db.table("locations").select("id,city,state,brand_id,last_refresh_at,created_at")
    if brand_id:
        loc_query = loc_query.eq("brand_id", brand_id)
    locations_result = loc_query.execute()
    locations = locations_result.data or []
    total_locations = len(locations)

    # Fetch generations
    gen_query = db.table("generations").select("id,keyword,city,location_id,word_count,pop_score,created_at")
    if brand_id:
        gen_query = gen_query.eq("brand_id", brand_id)
    generations_result = gen_query.order("created_at", desc=True).execute()
    generations = generations_result.data or []
    total_generations = len(generations)

    # Compute average SEO score
    scores = []
    for g in generations:
        ps = g.get("pop_score")
        if ps and isinstance(ps, dict):
            overall = ps.get("overall_score")
            if overall is not None:
                scores.append(overall)
    avg_score = round(sum(scores) / len(scores)) if scores else 0

    # Content freshness based on generation dates
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    sixty_days_ago = now - timedelta(days=60)

    fresh = 0
    aging = 0
    stale = 0
    for g in generations:
        created = g.get("created_at")
        if not created:
            stale += 1
            continue
        try:
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            stale += 1
            continue
        if dt >= thirty_days_ago:
            fresh += 1
        elif dt >= sixty_days_ago:
            aging += 1
        else:
            stale += 1

    # Recent generations (last 5)
    recent_generations = []
    for g in generations[:5]:
        ps = g.get("pop_score")
        score_val = ps.get("overall_score") if ps and isinstance(ps, dict) else None
        recent_generations.append({
            "keyword": g.get("keyword", ""),
            "city": g.get("city", ""),
            "word_count": g.get("word_count", 0),
            "score": score_val,
            "created_at": g.get("created_at"),
        })

    # Top scores (top 5 by score)
    scored = [
        g for g in generations
        if g.get("pop_score") and isinstance(g["pop_score"], dict) and g["pop_score"].get("overall_score") is not None
    ]
    scored.sort(key=lambda g: g["pop_score"]["overall_score"], reverse=True)
    top_scores = []
    for g in scored[:5]:
        top_scores.append({
            "keyword": g.get("keyword", ""),
            "city": g.get("city", ""),
            "score": g["pop_score"]["overall_score"],
            "created_at": g.get("created_at"),
        })

    # Needs refresh: locations with no content or last generation 60+ days ago
    # Build a map of location_id -> latest generation date
    loc_latest: dict[str, datetime] = {}
    for g in generations:
        loc_id = g.get("location_id")
        if not loc_id:
            continue
        created = g.get("created_at")
        if not created:
            continue
        try:
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            continue
        if loc_id not in loc_latest or dt > loc_latest[loc_id]:
            loc_latest[loc_id] = dt

    needs_refresh = []
    for loc in locations:
        loc_id = loc["id"]
        latest = loc_latest.get(loc_id)
        if latest is None:
            needs_refresh.append({
                "city": loc.get("city", ""),
                "state": loc.get("state", ""),
                "last_generated": None,
                "days_ago": None,
            })
        else:
            days_ago = (now - latest).days
            if days_ago >= 60:
                needs_refresh.append({
                    "city": loc.get("city", ""),
                    "state": loc.get("state", ""),
                    "last_generated": latest.isoformat(),
                    "days_ago": days_ago,
                })

    # Sort: no-content first, then by days_ago descending
    needs_refresh.sort(key=lambda x: (x["days_ago"] is not None, -(x["days_ago"] or 0)))

    return {
        "total_locations": total_locations,
        "total_generations": total_generations,
        "avg_score": avg_score,
        "content_freshness": {
            "fresh": fresh,
            "aging": aging,
            "stale": stale,
        },
        "recent_generations": recent_generations,
        "top_scores": top_scores,
        "needs_refresh": needs_refresh,
    }
