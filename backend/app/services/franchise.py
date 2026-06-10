"""Franchise development content - fact sheet extraction and page generation prompts."""
from __future__ import annotations
import logging
from typing import Any

from app.services.claude import MODELS, get_client, extract_json

logger = logging.getLogger(__name__)

FACT_SHEET_FIELDS = [
    "investment_min", "investment_max", "franchise_fee", "royalty_pct",
    "ad_fund_pct", "territory_model", "training_support", "process_steps",
    "differentiators", "ideal_candidate", "proof_points",
]

FACT_SHEET_SCHEMA = {
    "type": "object",
    "properties": {
        "investment_min": {"type": ["number", "null"]},
        "investment_max": {"type": ["number", "null"]},
        "franchise_fee": {"type": ["number", "null"]},
        "royalty_pct": {"type": ["string", "null"]},
        "ad_fund_pct": {"type": ["string", "null"]},
        "territory_model": {"type": ["string", "null"]},
        "training_support": {"type": "array", "items": {"type": "string"}},
        "process_steps": {"type": "array", "items": {"type": "string"}},
        "differentiators": {"type": "array", "items": {"type": "string"}},
        "ideal_candidate": {"type": ["string", "null"]},
        "proof_points": {"type": "array", "items": {"type": "string"}},
    },
    "required": FACT_SHEET_FIELDS,
    "additionalProperties": False,
}

EXTRACTION_PROMPT = """Extract franchise development facts from these scraped pages of a brand's franchise website.

Rules:
- Only extract facts explicitly stated in the text. Never infer or invent numbers.
- Dollar amounts as plain numbers (e.g. 49500). Percentages as strings (e.g. "6%").
- If a fact is absent, use null (or [] for lists).

SCRAPED PAGES:
{pages}"""


async def extract_fact_sheet(scraped_pages: list[dict]) -> dict:
    """Run Claude extraction over scraped page content. Returns the fact sheet dict."""
    pages_text = "\n\n---\n\n".join(
        f"URL: {p.get('url', 'unknown')}\n{(p.get('content') or p.get('markdown') or '')[:15000]}"
        for p in scraped_pages
    )
    client = get_client()
    resp = await client.messages.create(
        model=MODELS["sonnet"],
        max_tokens=4000,
        output_config={"format": {"type": "json_schema", "schema": FACT_SHEET_SCHEMA}},
        messages=[{"role": "user", "content": EXTRACTION_PROMPT.format(pages=pages_text)}],
    )
    text = next(b.text for b in resp.content if b.type == "text")
    return extract_json(text)


PAGE_TYPES: dict[str, dict[str, str]] = {
    "franchise_why": {
        "label": "Why Franchise With [Brand]",
        "brief": (
            "Write the brand's core franchise-recruitment persuasion page: why a prospective "
            "franchisee should choose this brand over others. Cover differentiators, proof "
            "points, the support system, who thrives as an owner (ideal candidate), and end "
            "with a clear next-step call to action into the discovery process. Audience: a "
            "prospective franchisee evaluating a six-figure investment - confident, concrete, "
            "respectful of their diligence. No consumer-marketing fluff."
        ),
    },
    "franchise_investment": {
        "label": "Investment & Fees",
        "brief": (
            "Write a transparent investment and fees page for prospective franchisees. Cover "
            "the total investment range, initial franchise fee, ongoing royalty and ad-fund "
            "percentages, what the investment includes, territory model, and the steps to "
            "ownership. Present numbers in a clean structure (a table where natural). "
            "Transparency builds trust - do not bury or spin the costs. End with a CTA to "
            "request the FDD or book a discovery call."
        ),
    },
}

FACT_DISCIPLINE = (
    "FACT DISCIPLINE: Use ONLY facts from the FACT SHEET below. Never invent numbers, "
    "dates, counts, or claims. If a needed fact is missing, either write around it or "
    "insert [CONFIRM: what is needed] for the team to fill in."
)

LIGHT_SEO = (
    "SEO: Start the output with 'Title tag:' and 'Meta description:' suggestion lines, then "
    "the page itself with one H1 and descriptive H2 sections. Use natural phrases like "
    "'franchise opportunity' where they fit. There are no keyword targets - readability "
    "and persuasion win every tradeoff."
)


def build_franchise_user_prompt(page_type: str, brand_name: str, fact_sheet: dict) -> str:
    spec = PAGE_TYPES[page_type]
    lines = [f"PAGE TO WRITE: {spec['label'].replace('[Brand]', brand_name)}", "", spec["brief"], ""]
    lines.append(FACT_DISCIPLINE)
    lines.append("")
    lines.append("FACT SHEET:")
    for key in FACT_SHEET_FIELDS:
        val = fact_sheet.get(key)
        if val not in (None, "", []):
            lines.append(f"- {key}: {val}")
    lines.append("")
    lines.append(LIGHT_SEO)
    return "\n".join(lines)
