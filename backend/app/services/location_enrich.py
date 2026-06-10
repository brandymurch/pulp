"""City-level local context enrichment.

A Pulp location is a franchise/territory that generates pages for many target
cities. Franchise-level data (team_lead, certifications, reviews) lives on the
location record. City-level data (neighborhoods, landmarks, housing stock,
climate, seasonal patterns, common jobs, local challenges, fun facts) is
generated per page using this service, keyed on the target city/state, not the
franchise's home city.
"""
from __future__ import annotations
import logging
from typing import Any

logger = logging.getLogger(__name__)


# Keys the model is allowed to suggest. Anything else is stripped.
ENRICHMENT_KEYS = (
    "neighborhoods",
    "local_landmarks",
    "housing_notes",
    "climate_notes",
    "seasonal_notes",
    "common_job",
    "local_challenge",
    "fun_fact",
)

# Structured-output schema for the enrichment call.
ENRICHMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "neighborhoods": {"type": "array", "items": {"type": "string"}},
        "local_landmarks": {"type": "array", "items": {"type": "string"}},
        "housing_notes": {"type": "string"},
        "climate_notes": {"type": "string"},
        "seasonal_notes": {"type": "string"},
        "common_job": {"type": "string"},
        "local_challenge": {"type": "string"},
        "fun_fact": {"type": "string"},
    },
    "required": [
        "neighborhoods", "local_landmarks", "housing_notes", "climate_notes",
        "seasonal_notes", "common_job", "local_challenge", "fun_fact",
    ],
    "additionalProperties": False,
}


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
        "woven into landing-page content for that city. Be specific and verifiable in "
        "style: name real neighborhoods, landmarks, weather patterns, and housing eras. "
        "If unsure about a fact, prefer well-known general details over invented "
        "specifics. If you are not confident about a field at all, leave it as an empty "
        "string or empty list rather than inventing details. Never use em dashes.\n\n"
        "Return ONLY valid JSON with exactly these keys:\n"
        '{\n'
        '  "neighborhoods": [list of 4-8 well-known neighborhoods or districts in the city, '
        'or nearby suburbs if the city itself is small],\n'
        '  "local_landmarks": [list of 2-5 well-known landmarks, parks, institutions, or '
        'geographic features locals would recognize],\n'
        '  "housing_notes": "2-3 sentences on the typical residential housing stock '
        '(eras, common construction types, notable building features) relevant to the brand services",\n'
        '  "climate_notes": "2-3 sentences on local climate factors that affect homeowners '
        'in ways relevant to the brand services",\n'
        '  "seasonal_notes": "2-3 sentences on how demand or conditions for the brand services '
        'shift across the seasons in this area",\n'
        '  "common_job": "2-3 sentences on the kind of project the brand most often does in this city, '
        'grounded in housing stock and climate",\n'
        '  "local_challenge": "2-3 sentences on a specific challenge homeowners in this city face '
        'that the brand addresses",\n'
        '  "fun_fact": "1-2 short, true, locally-distinctive cultural or geographic details. '
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
        "local_landmarks": parsed.get("local_landmarks") or [],
        "housing_notes": parsed.get("housing_notes") or "",
        "climate_notes": parsed.get("climate_notes") or "",
        "seasonal_notes": parsed.get("seasonal_notes") or "",
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

    Returns a dict with the ENRICHMENT_KEYS. Empty values for keys the model
    declined to fill in. Returns an empty-shape dict on any failure rather
    than raising -- callers should treat enrichment as best-effort.
    """
    if not city or not state:
        return _normalize({})

    from app.config import ANTHROPIC_API_KEY
    from app.services.claude import get_client, MODELS, extract_json

    if not ANTHROPIC_API_KEY:
        return _normalize({})

    system, user = _build_prompts(city, state, brand_name, services, industry_hint)

    client = get_client()
    try:
        # Cheap structured task: route through the haiku entry in MODELS.
        response = await client.messages.create(
            model=MODELS["haiku"],
            max_tokens=2000,
            temperature=0.3,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"format": {"type": "json_schema", "schema": ENRICHMENT_SCHEMA}},
        )
    except Exception as e:
        logger.warning("location enrichment call failed for %s, %s: %s", city, state, e)
        return _normalize({})

    raw = "".join(b.text for b in response.content if hasattr(b, "text"))

    try:
        parsed = extract_json(raw)
    except ValueError:
        logger.warning("location enrichment returned non-JSON for %s, %s: %s", city, state, raw[:200])
        return _normalize({})
    if not isinstance(parsed, dict):
        logger.warning("location enrichment returned non-object for %s, %s", city, state)
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
