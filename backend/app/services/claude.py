"""Claude content generation service."""
from __future__ import annotations
import logging
from typing import Any

import anthropic

from app.config import ANTHROPIC_API_KEY

logger = logging.getLogger(__name__)


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
