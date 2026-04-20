"""POP API integration - briefs and scoring."""
from __future__ import annotations
import asyncio
import logging
import re
from typing import Any

import httpx

from app.config import POP_API_KEY, POP_EXPOSE_URL, POP_TASK_URL

logger = logging.getLogger(__name__)


async def _poll_task(task_id: str, max_attempts: int = 30, interval: float = 3.0) -> dict:
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
    location = location_name or "United States"

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

    return {
        "target_word_count": (report.get("wordCount") or {}).get("target") or 1500,
        "term_targets": term_targets,
        "lsa_phrases": terms.get("lsaPhrases", []),
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
