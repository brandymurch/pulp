"""City-level local context enrichment.

A Pulp location is a franchise/territory that generates pages for many target
cities. Franchise-level data (team_lead, certifications, reviews) lives on the
location record. City-level data (neighborhoods, housing stock, climate, common
jobs, local challenges, fun facts) is generated per page using this service,
keyed on the target city/state, not the franchise's home city.
"""
from __future__ import annotations
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


# Keys the model is allowed to suggest. Anything else is stripped.
ENRICHMENT_KEYS = (
    "neighborhoods",
    "housing_notes",
    "climate_notes",
    "common_job",
    "local_challenge",
    "fun_fact",
)


def _build_prompts(city: str, state: str, brand_name: str, services: list[str] | None,
                   industry_hint: str | None) -> tuple[str, str]:
    services_line = ""
    if services:
        services_line = f"Brand services: {', '.join(services[:10])}\n"
    brand_line = f"Brand: {brand_name}\n" if brand_name else ""
    industry_line = f"Industry: {industry_hint}\n" if industry_hint else ""

    system = (
        "You enrich location context for a local-business SEO tool. Given a city, state, "
        "and the brand's services, return concrete, locally-grounded details that can be "
        "woven into landing-page content for that city. Be specific, not generic. "
        "If you are not confident about a fact, leave that field as an empty string or empty list "
        "rather than inventing details. Never use em dashes.\n\n"
        "Return ONLY valid JSON with exactly these keys:\n"
        '{\n'
        '  "neighborhoods": [list of 4-8 well-known neighborhoods or districts in the city, '
        'or nearby suburbs if the city itself is small],\n'
        '  "housing_notes": "one sentence on the typical residential housing stock '
        '(eras, common construction types, notable building features) relevant to the brand services",\n'
        '  "climate_notes": "one sentence on local climate factors that affect homeowners '
        'in ways relevant to the brand services",\n'
        '  "common_job": "one sentence on the kind of project the brand most often does in this city, '
        'grounded in housing stock and climate",\n'
        '  "local_challenge": "one sentence on a specific challenge homeowners in this city face '
        'that the brand addresses",\n'
        '  "fun_fact": "one short, true, locally-distinctive cultural or geographic detail. '
        'Skip if not confident."\n'
        '}\n'
        "Do not include markdown fences. Do not include extra keys."
    )

    user = (
        f"City: {city}\n"
        f"State: {state}\n"
        f"{brand_line}{industry_line}{services_line}"
        "Return the JSON now."
    )
    return system, user


def _normalize(parsed: dict) -> dict[str, Any]:
    """Coerce model output into the canonical shape, dropping unknown keys."""
    return {
        "neighborhoods": parsed.get("neighborhoods") or [],
        "housing_notes": parsed.get("housing_notes") or "",
        "climate_notes": parsed.get("climate_notes") or "",
        "common_job": parsed.get("common_job") or "",
        "local_challenge": parsed.get("local_challenge") or "",
        "fun_fact": parsed.get("fun_fact") or "",
    }


async def enrich_for_city(
    city: str,
    state: str,
    brand_name: str = "",
    services: list[str] | None = None,
    industry_hint: str | None = None,
) -> dict[str, Any]:
    """Generate city-level context for a target city.

    Returns a dict with keys: neighborhoods, housing_notes, climate_notes,
    common_job, local_challenge, fun_fact. Empty values for keys the model
    declined to fill in. Returns an empty-shape dict on any failure rather
    than raising -- callers should treat enrichment as best-effort.
    """
    if not city or not state:
        return _normalize({})

    import anthropic
    from app.config import ANTHROPIC_API_KEY

    if not ANTHROPIC_API_KEY:
        return _normalize({})

    system, user = _build_prompts(city, state, brand_name, services, industry_hint)

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    try:
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            temperature=0.3,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
    except Exception as e:
        logger.warning("location enrichment call failed for %s, %s: %s", city, state, e)
        return _normalize({})

    raw = "".join(b.text for b in response.content if hasattr(b, "text")).strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("location enrichment returned non-JSON for %s, %s: %s", city, state, raw[:200])
        return _normalize({})

    return _normalize(parsed)


# Franchise-level keys -- these stay on the location record and override
# enrichment values during merging. They describe the franchise itself, not
# the target city, so they should persist across all generations for a location.
FRANCHISE_KEYS = (
    "team_lead",
    "certifications",
    "competitors_to_avoid",
    "reviews",
    "general_notes",
)


def merge_with_franchise_context(
    enrichment: dict[str, Any],
    franchise_context: dict[str, Any] | None,
) -> dict[str, Any]:
    """Combine city-level enrichment with the location's franchise-level fields.

    Enrichment provides city-level keys. Franchise context overrides for any
    key it sets (so a manual override on the location wins), and adds the
    franchise-only keys (team_lead, certifications, competitors_to_avoid,
    reviews, general_notes).
    """
    if not franchise_context:
        return dict(enrichment)
    merged = dict(enrichment)
    for k, v in franchise_context.items():
        if v in (None, "", [], {}):
            continue
        merged[k] = v
    return merged
