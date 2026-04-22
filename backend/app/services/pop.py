"""POP API integration - briefs and scoring."""
from __future__ import annotations
import asyncio
import logging
import re
from typing import Any

import httpx

from app.config import POP_API_KEY, POP_EXPOSE_URL, POP_TASK_URL

logger = logging.getLogger(__name__)

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


async def _poll_task(task_id: str, max_attempts: int = 60, interval: float = 3.0) -> dict:
    """Poll POP API for task results."""
    async with httpx.AsyncClient(timeout=15) as client:
        for _ in range(max_attempts):
            resp = await client.get(f"{POP_TASK_URL}/{task_id}/results/")
            data = resp.json()

            if data.get("status") == "SUCCESS":
                return data
            if data.get("status") == "FAILURE":
                raise RuntimeError(data.get("msg") or "POP task failed")

            await asyncio.sleep(interval)

    raise TimeoutError("POP task timed out waiting for results")


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
        resp = await client.post(
            f"{POP_EXPOSE_URL}/get-terms/",
            json={
                "apiKey": POP_API_KEY,
                "keyword": keyword,
                "locationName": location,
                "targetUrl": target_url or "https://example.com/",
                "targetLanguage": "english",
            },
        )
        data = resp.json()

    if data.get("status") == "FAILURE":
        raise RuntimeError(data.get("msg") or "POP get-terms failed")

    return await _poll_task(data["taskId"])


async def _create_report(terms_data: dict) -> dict:
    """Create POP report to get target recommendations."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{POP_EXPOSE_URL}/create-report/",
            json={
                "apiKey": POP_API_KEY,
                "prepareId": terms_data["prepareId"],
                "lsaPhrases": terms_data["lsaPhrases"],
                "variations": terms_data.get("variations", []),
                "pageNotBuiltYet": 1,
                "considerOverOptimization": 1,
            },
        )
        data = resp.json()

    if data.get("status") == "FAILURE":
        raise RuntimeError(data.get("msg") or "POP create-report failed")

    return await _poll_task(data["taskId"])


async def get_enriched_brief(
    keyword: str,
    target_url: str | None = None,
    location_name: str | None = None,
) -> dict:
    """Get POP terms + report in one call. Returns term targets for prompt assembly."""
    terms = await _get_terms(
        keyword=keyword,
        target_url=target_url,
        location_name=location_name,
    )
    report_result = await _create_report(terms)
    report = report_result.get("report") or {}
    brief = report.get("cleanedContentBrief") or {}

    # Log all available POP data for debugging
    logger.info(f"POP report top-level keys: {list(report.keys())}")
    logger.info(f"POP brief keys: {list(brief.keys())}")
    for key in ["structureAnalysis", "structure", "seoTitle", "metaDescription", "titleTag", "headerRecommendations"]:
        if report.get(key):
            val = report[key]
            logger.info(f"POP {key}: {val if isinstance(val, str) else list(val.keys()) if isinstance(val, dict) else type(val)}")

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
    target_word_count = word_count_data.get("target") or 1500
    word_count_min = word_count_data.get("min") or 0
    word_count_max = word_count_data.get("max") or 0
    word_count_avg = word_count_data.get("average") or 0

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

    return {
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


async def score_content_with_pop(
    content: str,
    target_keyword: str,
    url: str | None = None,
    location_name: str | None = None,
) -> dict:
    """Score content using POP API terms + local counting."""
    terms = await _get_terms(
        keyword=target_keyword,
        target_url=url,
        location_name=location_name,
    )
    report_result = await _create_report(terms)
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
