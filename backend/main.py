"""Pulp API - POP + Claude content creation tool.

Single-file FastAPI backend for generating SEO-optimized content
using Page Optimizer Pro briefs and Claude AI.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any

import anthropic
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Pulp API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ─────────────────────────────────────────────────────────────────

POP_API_KEY = os.environ.get("POP_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

POP_EXPOSE_URL = "https://app.pageoptimizer.pro/api/expose"
POP_TASK_URL = "https://app.pageoptimizer.pro/api/task"


# ── Models ─────────────────────────────────────────────────────────────────


class BriefRequest(BaseModel):
    keyword: str
    target_url: str | None = None
    location: str | None = None


class BriefResponse(BaseModel):
    target_word_count: int
    term_targets: list[dict[str, Any]]
    lsa_phrases: list[str]


class GenerateRequest(BaseModel):
    keyword: str
    brief: dict[str, Any]
    business_name: str
    city: str
    services: list[str] = []
    content_type: str = "blog_post"


class GenerateResponse(BaseModel):
    title: str
    content: str
    word_count: int


class ScoreRequest(BaseModel):
    content: str
    keyword: str
    target_url: str | None = None


class ScoreResponse(BaseModel):
    overall_score: int
    term_score: int
    word_count_score: int
    recommendations: list[str]
    well_optimized: list[dict[str, Any]]
    missing: list[dict[str, Any]]


# ── POP API Integration ────────────────────────────────────────────────────


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


# ── Claude Content Generation ──────────────────────────────────────────────


def _build_system_prompt(content_type: str, services: list[str]) -> str:
    """Build system prompt for content generation."""
    content_type_display = content_type.replace("_", " ")

    parts = [
        f"You are an expert SEO content writer. Write a {content_type_display} "
        "that is comprehensive, well-structured, and optimized for search engines.",
        "",
        "CRITICAL RULES:",
        "- Never use em dashes. Use commas, periods, or semicolons instead.",
        "- Write in Markdown format.",
        "- Start with an H1 title line (# Title).",
        "- Use H2 (##) for main sections and H3 (###) for subsections.",
        "- Write naturally while incorporating the required terms at their target counts.",
        "- Do not stuff keywords unnaturally.",
        "- Include a compelling introduction that uses the primary keyword in the first 100 words.",
        "- End with a clear call-to-action section.",
        "- Be specific, actionable, and authoritative.",
    ]

    if services:
        parts.append("")
        parts.append("SERVICES THIS BUSINESS OFFERS (reference only these):")
        for s in services:
            parts.append(f"- {s}")
        parts.append("Do NOT mention services not in this list.")

    return "\n".join(parts)


def _build_user_prompt(
    keyword: str,
    business_name: str,
    city: str,
    content_type: str,
    target_word_count: int,
    term_targets: list[dict],
) -> str:
    """Build user prompt with POP brief constraints."""
    content_type_display = content_type.replace("_", " ")

    parts = [
        f"Write a {content_type_display} for **{business_name}** in **{city}**.",
        "",
        f"**Primary Keyword:** {keyword}",
        f"**Target Word Count:** {target_word_count} words (aim for this length)",
        "",
    ]

    if term_targets:
        sorted_terms = sorted(
            term_targets,
            key=lambda t: t.get("weight", 0),
            reverse=True,
        )[:30]

        parts.append("**POP Content Brief - Required Term Usage:**")
        parts.append("Include these terms at the specified counts:")
        parts.append("")
        for t in sorted_terms:
            phrase = t["phrase"]
            target = t.get("target", 0)
            if target > 0:
                parts.append(f'- "{phrase}" - use {target}x')
        parts.append("")

    parts.append(
        "Write the complete content now. Make it comprehensive, well-structured, "
        "and locally relevant. Include the H1 title as the first line."
    )

    return "\n".join(parts)


def _parse_generated_content(raw_text: str, keyword: str) -> tuple[str, str]:
    """Parse generated content to extract title and body."""
    lines = raw_text.strip().split("\n")
    title = ""
    content_start = 0

    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            title = stripped[2:].strip()
            content_start = i + 1
            break

    if not title:
        title = keyword.title()
        content_start = 0

    content = "\n".join(lines[content_start:]).strip()
    return title, content


async def generate_content(
    keyword: str,
    brief: dict[str, Any],
    business_name: str,
    city: str,
    services: list[str],
    content_type: str,
) -> dict[str, Any]:
    """Generate content using Claude with POP brief constraints."""
    target_word_count = brief.get("target_word_count", 1500)
    term_targets = brief.get("term_targets", [])

    system_prompt = _build_system_prompt(content_type, services)
    user_prompt = _build_user_prompt(
        keyword=keyword,
        business_name=business_name,
        city=city,
        content_type=content_type,
        target_word_count=target_word_count,
        term_targets=term_targets,
    )

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=12000,
        temperature=0.4,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw_text = ""
    for block in response.content:
        if hasattr(block, "text"):
            raw_text += block.text

    # Strip em dashes from output
    raw_text = raw_text.replace("\u2014", "-").replace("\u2013", "-")

    title, content = _parse_generated_content(raw_text, keyword)
    word_count = len(content.split())

    return {"title": title, "content": content, "word_count": word_count}


# ── Endpoints ──────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/brief", response_model=BriefResponse)
async def create_brief(req: BriefRequest):
    """Get a POP optimization brief for a keyword."""
    if not POP_API_KEY:
        raise HTTPException(status_code=503, detail="POP_API_KEY not configured")

    try:
        result = await get_enriched_brief(
            keyword=req.keyword,
            target_url=req.target_url,
            location_name=req.location,
        )
        return BriefResponse(
            target_word_count=result["target_word_count"],
            term_targets=result["term_targets"],
            lsa_phrases=result["lsa_phrases"],
        )
    except Exception as e:
        logger.error(f"Brief generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate", response_model=GenerateResponse)
async def create_content(req: GenerateRequest):
    """Generate SEO-optimized content using Claude."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    try:
        result = await generate_content(
            keyword=req.keyword,
            brief=req.brief,
            business_name=req.business_name,
            city=req.city,
            services=req.services,
            content_type=req.content_type,
        )
        return GenerateResponse(
            title=result["title"],
            content=result["content"],
            word_count=result["word_count"],
        )
    except Exception as e:
        logger.error(f"Content generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/score", response_model=ScoreResponse)
async def score_content(req: ScoreRequest):
    """Score content against a target keyword."""
    try:
        if POP_API_KEY:
            result = await score_content_with_pop(
                content=req.content,
                target_keyword=req.keyword,
                url=req.target_url,
            )
        else:
            result = stub_score(content=req.content, target_keyword=req.keyword)

        return ScoreResponse(**result)
    except Exception as e:
        logger.error(f"Scoring failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
