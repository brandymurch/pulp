"""POP API integration - briefs and scoring."""
from __future__ import annotations
import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.config import POP_API_KEY, POP_EXPOSE_URL, POP_TASK_URL

logger = logging.getLogger(__name__)

# POP report creation counts against the plan's monthly allowance, so briefs
# for an already-seen (keyword, location) are served from Supabase instead.
BRIEF_CACHE_DAYS = 30


def _brief_cache_key(keyword: str, location_name: str | None, target_url: str | None) -> str:
    return "|".join(
        (part or "").strip().lower()
        for part in (keyword, location_name, target_url)
    )


def _brief_cache_get(cache_key: str) -> dict | None:
    from app.db import get_db

    cutoff = (datetime.now(timezone.utc) - timedelta(days=BRIEF_CACHE_DAYS)).isoformat()
    res = (
        get_db()
        .table("pop_brief_cache")
        .select("brief")
        .eq("cache_key", cache_key)
        .gte("created_at", cutoff)
        .limit(1)
        .execute()
    )
    return res.data[0]["brief"] if res.data else None


def _brief_cache_put(cache_key: str, keyword: str, location_name: str | None, brief: dict) -> None:
    from app.db import get_db

    get_db().table("pop_brief_cache").upsert(
        {
            "cache_key": cache_key,
            "keyword": keyword,
            "location": location_name or "",
            "brief": brief,
            "created_at": "now()",
        },
        on_conflict="cache_key",
    ).execute()

REGION_ABBREV = {
    # US States
    "AL": ("Alabama", "United States"), "AK": ("Alaska", "United States"),
    "AZ": ("Arizona", "United States"), "AR": ("Arkansas", "United States"),
    "CA": ("California", "United States"), "CO": ("Colorado", "United States"),
    "CT": ("Connecticut", "United States"), "DE": ("Delaware", "United States"),
    "FL": ("Florida", "United States"), "GA": ("Georgia", "United States"),
    "HI": ("Hawaii", "United States"), "ID": ("Idaho", "United States"),
    "IL": ("Illinois", "United States"), "IN": ("Indiana", "United States"),
    "IA": ("Iowa", "United States"), "KS": ("Kansas", "United States"),
    "KY": ("Kentucky", "United States"), "LA": ("Louisiana", "United States"),
    "ME": ("Maine", "United States"), "MD": ("Maryland", "United States"),
    "MA": ("Massachusetts", "United States"), "MI": ("Michigan", "United States"),
    "MN": ("Minnesota", "United States"), "MS": ("Mississippi", "United States"),
    "MO": ("Missouri", "United States"), "MT": ("Montana", "United States"),
    "NE": ("Nebraska", "United States"), "NV": ("Nevada", "United States"),
    "NH": ("New Hampshire", "United States"), "NJ": ("New Jersey", "United States"),
    "NM": ("New Mexico", "United States"), "NY": ("New York", "United States"),
    "NC": ("North Carolina", "United States"), "ND": ("North Dakota", "United States"),
    "OH": ("Ohio", "United States"), "OK": ("Oklahoma", "United States"),
    "OR": ("Oregon", "United States"), "PA": ("Pennsylvania", "United States"),
    "RI": ("Rhode Island", "United States"), "SC": ("South Carolina", "United States"),
    "SD": ("South Dakota", "United States"), "TN": ("Tennessee", "United States"),
    "TX": ("Texas", "United States"), "UT": ("Utah", "United States"),
    "VT": ("Vermont", "United States"), "VA": ("Virginia", "United States"),
    "WA": ("Washington", "United States"), "WV": ("West Virginia", "United States"),
    "WI": ("Wisconsin", "United States"), "WY": ("Wyoming", "United States"),
    "DC": ("District of Columbia", "United States"),
    # Canadian Provinces
    "AB": ("Alberta", "Canada"), "BC": ("British Columbia", "Canada"),
    "MB": ("Manitoba", "Canada"), "NB": ("New Brunswick", "Canada"),
    "NL": ("Newfoundland and Labrador", "Canada"), "NS": ("Nova Scotia", "Canada"),
    "NT": ("Northwest Territories", "Canada"), "NU": ("Nunavut", "Canada"),
    "ON": ("Ontario", "Canada"), "PE": ("Prince Edward Island", "Canada"),
    "QC": ("Quebec", "Canada"), "SK": ("Saskatchewan", "Canada"),
    "YT": ("Yukon", "Canada"),
}


def _normalize_location(location: str) -> str:
    """Convert 'columbus, oh' to 'Columbus,Ohio,United States' for POP API.
    Also handles Canadian provinces: 'toronto, on' -> 'Toronto,Ontario,Canada'.
    POP API is case-sensitive, so we title-case the city."""
    if not location:
        return "United States"
    parts = [p.strip() for p in location.split(",")]
    if len(parts) == 2:
        city = parts[0].title()
        abbrev = parts[1].strip().upper()
        if abbrev in REGION_ABBREV:
            region, country = REGION_ABBREV[abbrev]
            return f"{city},{region},{country}"
        return f"{city},{abbrev},United States"
    if len(parts) == 1:
        return f"{parts[0].title()},United States"
    return location


class PopApiError(RuntimeError):
    """POP API returned an error or an unexpected response."""


_RETRYABLE_STATUS = {429, 500, 502, 503, 504}

# Celery-style task states POP may return while a task is still running.
_IN_PROGRESS_STATES = {"PENDING", "RECEIVED", "STARTED", "PROGRESS", "RETRY"}


def _body_snippet(resp: httpx.Response, limit: int = 300) -> str:
    """A short, safe slice of a response body for error messages/logs."""
    try:
        return resp.text[:limit]
    except Exception:
        return "<unreadable body>"


async def _request_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    json_body: dict | None = None,
    max_attempts: int = 3,
) -> dict:
    """POP HTTP call with explicit status checks and retry/backoff on 429/5xx.

    Raises PopApiError with the HTTP status and a body snippet instead of
    blindly calling resp.json() on error pages (which previously surfaced as
    opaque JSONDecodeErrors or silently wrong data).
    """
    last_error: Exception = PopApiError(f"POP API request failed: {method} {url}")
    for attempt in range(1, max_attempts + 1):
        try:
            resp = await client.request(method, url, json=json_body)
        except httpx.HTTPError as e:
            last_error = PopApiError(f"POP API network error on {method} {url}: {e!r}")
        else:
            if resp.status_code in _RETRYABLE_STATUS:
                last_error = PopApiError(
                    f"POP API {resp.status_code} on {method} {url}: {_body_snippet(resp)}"
                )
            elif resp.status_code >= 400:
                raise PopApiError(
                    f"POP API {resp.status_code} on {method} {url}: {_body_snippet(resp)}"
                )
            else:
                try:
                    return resp.json()
                except ValueError as e:
                    raise PopApiError(
                        f"POP API returned non-JSON ({resp.status_code}) on "
                        f"{method} {url}: {_body_snippet(resp)}"
                    ) from e
        if attempt < max_attempts:
            logger.warning(
                "POP request attempt %d/%d failed, retrying: %s",
                attempt, max_attempts, last_error,
            )
            await asyncio.sleep(2 ** (attempt - 1))
    raise last_error


async def _poll_task(task_id: str, max_attempts: int = 90, interval: float = 3.0) -> dict:
    """Poll POP API for task results."""
    last_status: str | None = None
    async with httpx.AsyncClient(timeout=15) as client:
        for _ in range(max_attempts):
            data = await _request_json(
                client, "GET", f"{POP_TASK_URL}/{task_id}/results/"
            )
            status = data.get("status")

            if status == "SUCCESS":
                return data
            if status == "FAILURE":
                raise PopApiError(
                    f"POP task {task_id} failed: {data.get('msg') or str(data)[:300]}"
                )
            if status not in _IN_PROGRESS_STATES:
                # Schema change or error payload without a known status -
                # fail fast instead of polling for 4.5 minutes.
                raise PopApiError(
                    f"POP task {task_id} returned unexpected payload: {str(data)[:300]}"
                )

            last_status = status
            await asyncio.sleep(interval)

    raise PopApiError(
        f"POP task {task_id} timed out after {int(max_attempts * interval)}s "
        f"(last status: {last_status}). Note: POP returns PENDING for unknown "
        "task ids, so this can also mean the task was lost upstream."
    )


def _require_task_id(data: dict, endpoint: str) -> str:
    """POP reports failures as HTTP 200 + {"status": "FAILURE", "msg": ...}."""
    if data.get("status") == "FAILURE":
        raise PopApiError(f"POP {endpoint} failed: {data.get('msg') or str(data)[:300]}")
    task_id = data.get("taskId")
    if not task_id:
        raise PopApiError(
            f"POP {endpoint} response missing taskId: {str(data)[:300]}"
        )
    return task_id


async def _get_terms(
    keyword: str,
    target_url: str | None = None,
    location_name: str | None = None,
) -> dict:
    """Get POP terms for a keyword."""
    # POP API only accepts country-level locations (e.g. "United States", "Canada")
    # City/state info is used in the Claude prompt, not here.
    location = "United States"
    if location_name:
        normalized = _normalize_location(location_name)
        if normalized.endswith(",Canada"):
            location = "Canada"

    async with httpx.AsyncClient(timeout=60) as client:
        data = await _request_json(
            client,
            "POST",
            f"{POP_EXPOSE_URL}/get-terms/",
            json_body={
                "apiKey": POP_API_KEY,
                "keyword": keyword,
                "locationName": location,
                "targetUrl": target_url or "https://example.com/",
                "targetLanguage": "english",
            },
        )

    return await _poll_task(_require_task_id(data, "get-terms"))


async def _create_report(terms_data: dict) -> dict:
    """Create POP report to get target recommendations."""
    prepare_id = terms_data.get("prepareId")
    if not prepare_id:
        raise PopApiError(
            "POP terms result missing prepareId "
            f"(keys: {list(terms_data.keys())[:20]})"
        )

    async with httpx.AsyncClient(timeout=60) as client:
        data = await _request_json(
            client,
            "POST",
            f"{POP_EXPOSE_URL}/create-report/",
            json_body={
                "apiKey": POP_API_KEY,
                "prepareId": prepare_id,
                "lsaPhrases": terms_data.get("lsaPhrases", []),
                "variations": terms_data.get("variations", []),
                "pageNotBuiltYet": 1,
                "considerOverOptimization": 1,
            },
        )

    return await _poll_task(_require_task_id(data, "create-report"))


async def get_enriched_brief(
    keyword: str,
    target_url: str | None = None,
    location_name: str | None = None,
) -> dict:
    """Get POP terms + report in one call. Returns term targets for prompt assembly.

    Results are cached in Supabase for BRIEF_CACHE_DAYS per (keyword, location,
    target_url) so repeat runs don't consume POP report allowance. Cache
    failures are logged and ignored - the brief still comes from POP.
    """
    cache_key = _brief_cache_key(keyword, location_name, target_url)
    try:
        cached = await asyncio.to_thread(_brief_cache_get, cache_key)
        if cached:
            logger.info(
                "POP brief cache hit for keyword=%r location=%r", keyword, location_name
            )
            return cached
    except Exception:
        logger.warning("POP brief cache lookup failed; fetching fresh", exc_info=True)

    try:
        terms = await _get_terms(
            keyword=keyword,
            target_url=target_url,
            location_name=location_name,
        )
        report_result = await _create_report(terms)
    except Exception:
        # Log here with traceback: some callers (pipeline gather) swallow
        # exceptions, so this is the only guaranteed record of the root cause.
        logger.exception(
            "POP brief failed for keyword=%r location=%r", keyword, location_name
        )
        raise
    report = report_result.get("report") or {}
    brief = report.get("cleanedContentBrief") or {}

    # Log all available POP data for debugging
    logger.info("POP report top-level keys: %s", list(report.keys()))
    logger.info("POP brief keys: %s", list(brief.keys()))
    for key in ["structureAnalysis", "structure", "seoTitle", "metaDescription", "titleTag", "headerRecommendations"]:
        if report.get(key):
            val = report[key]
            logger.info("POP %s: %s", key, val if isinstance(val, str) else list(val.keys()) if isinstance(val, dict) else type(val))

    term_targets = [
        {
            "phrase": p["term"]["phrase"],
            "weight": p["term"].get("weight", 0),
            "target": (p.get("contentBrief") or {}).get("target")
            or (p.get("contentBrief") or {}).get("targetMax", 0),
        }
        for p in (brief.get("p") or [])
        if p.get("term", {}).get("phrase")
        and p.get("term", {}).get("type") != "keyword"
    ]

    # Extract word count range
    word_count_data = report.get("wordCount") or {}
    logger.info("POP wordCount data: %s", word_count_data)
    target_word_count = word_count_data.get("target") or word_count_data.get("recommended") or 1500
    word_count_min = word_count_data.get("min") or word_count_data.get("minimum") or 0
    word_count_max = word_count_data.get("max") or word_count_data.get("maximum") or 0
    word_count_avg = word_count_data.get("average") or word_count_data.get("avg") or word_count_data.get("mean") or 0
    # If no min/max, estimate from target
    if not word_count_min and target_word_count:
        word_count_min = int(target_word_count * 0.8)
    if not word_count_max and target_word_count:
        word_count_max = int(target_word_count * 1.2)

    # Extract keyword variations
    variations = terms.get("variations", [])

    # Extract competitor headings from the report
    competitor_headings = []
    structure = report.get("structureAnalysis") or report.get("structure") or {}
    heading_data = structure.get("headings") or structure.get("h2") or []
    if isinstance(heading_data, list):
        for h in heading_data:
            if isinstance(h, dict) and h.get("text"):
                competitor_headings.append(h["text"])
            elif isinstance(h, str):
                competitor_headings.append(h)

    # Also try to get headings from the brief's common headings
    common_headings = []
    for p in (brief.get("p") or []):
        term_info = p.get("term") or {}
        if term_info.get("type") == "heading":
            common_headings.append(term_info.get("phrase", ""))

    # Recommended heading count
    recommended_headings = 0
    if structure.get("avgHeadingCount"):
        recommended_headings = int(structure["avgHeadingCount"])

    # Extract SEO title and meta description recommendations if available
    seo_title = report.get("seoTitle") or report.get("titleTag") or ""
    meta_description = report.get("metaDescription") or ""

    # Extract section/paragraph recommendations
    section_recommendations = []
    header_recs = report.get("headerRecommendations") or report.get("headers") or {}
    if isinstance(header_recs, dict):
        for key, val in header_recs.items():
            if isinstance(val, list):
                section_recommendations.extend(val)
            elif isinstance(val, str):
                section_recommendations.append(val)
    elif isinstance(header_recs, list):
        section_recommendations = header_recs

    # Extract paragraph/content recommendations
    paragraph_recs = report.get("paragraphRecommendations") or report.get("contentRecommendations") or []

    # POP optimization score if available
    pop_score = report.get("score") or report.get("optimizationScore") or None

    result = {
        "target_word_count": target_word_count,
        "word_count_min": word_count_min,
        "word_count_max": word_count_max,
        "word_count_avg": word_count_avg,
        "term_targets": term_targets,
        "lsa_phrases": terms.get("lsaPhrases", []),
        "variations": [v.get("phrase", v) if isinstance(v, dict) else v for v in variations],
        "competitor_headings": competitor_headings or common_headings,
        "recommended_heading_count": recommended_headings,
        "seo_title": seo_title if isinstance(seo_title, str) else "",
        "meta_description": meta_description if isinstance(meta_description, str) else "",
        "section_recommendations": section_recommendations[:10] if section_recommendations else [],
        "paragraph_recommendations": paragraph_recs[:10] if isinstance(paragraph_recs, list) else [],
        "pop_optimization_score": pop_score,
    }

    try:
        await asyncio.to_thread(_brief_cache_put, cache_key, keyword, location_name, result)
    except Exception:
        logger.warning("POP brief cache write failed", exc_info=True)

    return result


async def score_content_with_pop(
    content: str,
    target_keyword: str,
    url: str | None = None,
    location_name: str | None = None,
) -> dict:
    """Score content using POP API terms + local counting."""
    try:
        terms = await _get_terms(
            keyword=target_keyword,
            target_url=url,
            location_name=location_name,
        )
        report_result = await _create_report(terms)
    except Exception:
        logger.exception(
            "POP scoring failed for keyword=%r location=%r", target_keyword, location_name
        )
        raise
    report = report_result.get("report") or {}
    brief = report.get("cleanedContentBrief") or {}
    target_word_count = (report.get("wordCount") or {}).get("target")

    content_lower = content.lower()
    words = content.strip().split()
    word_count = len(words)

    # Score each term
    phrase_results: list[dict[str, Any]] = []
    for p in brief.get("p") or []:
        term_info = p.get("term") or {}
        phrase = term_info.get("phrase", "")
        if not phrase or term_info.get("type") == "keyword":
            continue

        target = (p.get("contentBrief") or {}).get("target") or (
            p.get("contentBrief") or {}
        ).get("targetMax", 0)
        weight = term_info.get("weight", 0)

        # Count occurrences
        escaped = re.escape(phrase.lower())
        matches = re.findall(rf"\b{escaped}\b", content_lower)
        current = len(matches)

        # Calculate individual score
        if target == 0:
            score = 100.0 if current > 0 else 50.0
        else:
            score = min(100.0, round((current / target) * 100))

        phrase_results.append({
            "phrase": phrase,
            "current": current,
            "target": target,
            "weight": weight,
            "score": score,
        })

    # Weighted overall term score
    total_weight = sum(p["weight"] for p in phrase_results)
    term_score = (
        round(sum(p["score"] * p["weight"] for p in phrase_results) / total_weight)
        if total_weight > 0
        else 0
    )

    # Word count score
    word_count_score = 100.0
    if target_word_count and word_count < target_word_count:
        word_count_score = round((word_count / target_word_count) * 100)

    # Final: 70% terms + 30% word count
    final_score = round(term_score * 0.7 + word_count_score * 0.3)

    # Categorize
    sorted_by_weight = sorted(phrase_results, key=lambda p: p["weight"], reverse=True)
    well_optimized = [p for p in sorted_by_weight if p["score"] >= 80][:10]
    missing = [p for p in sorted_by_weight if p["score"] == 0 and p["target"] > 0][:10]

    # Build recommendations
    recommendations: list[str] = []
    missing_terms = [p for p in sorted_by_weight if p["score"] == 0 and p["target"] > 0]
    needs_work = [p for p in sorted_by_weight if 0 < p["score"] < 80]

    if missing_terms:
        top_missing = ", ".join(f'"{m["phrase"]}"' for m in missing_terms[:3])
        recommendations.append(f"Missing important terms: {top_missing}")
    if needs_work:
        top_needs = ", ".join(f'"{n["phrase"]}"' for n in needs_work[:3])
        recommendations.append(f"Terms needing more usage: {top_needs}")
    if target_word_count and word_count < target_word_count:
        recommendations.append(
            f"Content is {word_count} words - POP recommends ~{target_word_count}"
        )

    return {
        "overall_score": min(final_score, 100),
        "term_score": term_score,
        "word_count_score": int(word_count_score),
        "recommendations": recommendations,
        "well_optimized": [
            {"phrase": t["phrase"], "current": t["current"], "target": t["target"]}
            for t in well_optimized
        ],
        "missing": [
            {"phrase": t["phrase"], "current": t["current"], "target": t["target"]}
            for t in missing
        ],
    }


def score_content_from_brief(content: str, brief: dict) -> dict:
    """Score content locally using an already-fetched brief. No POP API call needed."""
    term_targets = brief.get("term_targets", [])
    target_word_count = brief.get("target_word_count", 1500)

    content_lower = content.lower()
    words = content.strip().split()
    word_count = len(words)

    phrase_results = []
    for t in term_targets:
        phrase = t.get("phrase", "")
        target = t.get("target", 0)
        weight = t.get("weight", 0)
        if not phrase:
            continue

        escaped = re.escape(phrase.lower())
        matches = re.findall(rf"\b{escaped}\b", content_lower)
        current = len(matches)

        if target == 0:
            score = 100.0 if current > 0 else 50.0
        else:
            score = min(100.0, round((current / target) * 100))

        phrase_results.append({
            "phrase": phrase, "current": current, "target": target,
            "weight": weight, "score": score,
        })

    total_weight = sum(p["weight"] for p in phrase_results)
    term_score = (
        round(sum(p["score"] * p["weight"] for p in phrase_results) / total_weight)
        if total_weight > 0 else 0
    )

    word_count_score = 100.0
    if target_word_count and word_count < target_word_count:
        word_count_score = round((word_count / target_word_count) * 100)

    final_score = round(term_score * 0.7 + word_count_score * 0.3)

    sorted_by_weight = sorted(phrase_results, key=lambda p: p["weight"], reverse=True)
    well_optimized = [p for p in sorted_by_weight if p["score"] >= 80][:10]
    missing = [p for p in sorted_by_weight if p["score"] == 0 and p["target"] > 0][:10]

    recommendations = []
    missing_terms = [p for p in sorted_by_weight if p["score"] == 0 and p["target"] > 0]
    needs_work = [p for p in sorted_by_weight if 0 < p["score"] < 80]

    if missing_terms:
        top_missing = ", ".join(f'"{m["phrase"]}"' for m in missing_terms[:3])
        recommendations.append(f"Missing important terms: {top_missing}")
    if needs_work:
        top_needs = ", ".join(f'"{n["phrase"]}"' for n in needs_work[:3])
        recommendations.append(f"Terms needing more usage: {top_needs}")
    if target_word_count and word_count < target_word_count:
        recommendations.append(f"Content is {word_count} words, target is ~{target_word_count}")

    return {
        "overall_score": min(final_score, 100),
        "term_score": term_score,
        "word_count_score": int(word_count_score),
        "recommendations": recommendations,
        "well_optimized": [
            {"phrase": t["phrase"], "current": t["current"], "target": t["target"]}
            for t in well_optimized
        ],
        "missing": [
            {"phrase": t["phrase"], "current": t["current"], "target": t["target"]}
            for t in missing
        ],
    }


def stub_score(content: str, target_keyword: str) -> dict:
    """Basic content analysis fallback when POP API key is not set."""
    words = content.split()
    word_count = len(words)
    content_lower = content.lower()
    keyword_lower = target_keyword.lower()

    keyword_count = content_lower.count(keyword_lower)
    density = (keyword_count / max(word_count, 1)) * 100

    first_200_words = " ".join(words[:200]).lower()
    keyword_in_intro = keyword_lower in first_200_words
    keyword_in_title = keyword_lower in content_lower.split("\n")[0].lower()

    h2_count = len(re.findall(r"^##\s", content, re.MULTILINE))

    recommendations: list[str] = []
    if word_count < 1200:
        recommendations.append(
            f"Content is {word_count} words - aim for 1,500+ for competitive topics"
        )
    if not keyword_in_intro:
        recommendations.append("Include the target keyword in the first 200 words")
    if not keyword_in_title:
        recommendations.append("Include the target keyword in the title/H1")
    if density < 0.5:
        recommendations.append(f"Keyword density is {density:.1f}% - aim for 0.5-1.5%")
    elif density > 2.5:
        recommendations.append(
            f"Keyword density is {density:.1f}% - reduce to avoid over-optimization"
        )
    if h2_count < 3:
        recommendations.append(f"Only {h2_count} H2 headings - add more for better structure")

    score = 50.0
    if word_count >= 1500:
        score += 10
    elif word_count >= 1200:
        score += 5
    if keyword_in_intro:
        score += 10
    if keyword_in_title:
        score += 10
    if 0.5 <= density <= 2.0:
        score += 10
    if h2_count >= 4:
        score += 10
    elif h2_count >= 3:
        score += 5

    return {
        "overall_score": min(int(score), 100),
        "term_score": 0,
        "word_count_score": 100 if word_count >= 1200 else round((word_count / 1200) * 100),
        "recommendations": recommendations,
        "well_optimized": [],
        "missing": [],
    }
