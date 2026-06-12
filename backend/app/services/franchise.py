"""Franchise development content - fact sheet extraction and page generation prompts."""
from __future__ import annotations

import asyncio
import logging

from app.services.claude import MODELS, get_client, extract_json

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# URL selection for site discovery
# ---------------------------------------------------------------------------

URL_SELECTION_SCHEMA = {
    "type": "object",
    "properties": {
        "urls": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["urls"],
    "additionalProperties": False,
}

_URL_SELECTION_PROMPTS = {
    "fact_sheet": (
        "You are selecting pages from a franchise brand's website to scrape for franchise fact extraction.\n"
        "Pick up to {max_pages} URLs most relevant to franchise/ownership information:\n"
        "INCLUDE: pages about franchising, own-a-franchise, franchise opportunity, investment, "
        "fees, FAQ, the franchise process, territory information, about/leadership as supporting context.\n"
        "SKIP: blog post archives, privacy/terms policies, consumer-facing careers pages (not franchise), "
        "store/location finder pages with hundreds of individual location entries, generic contact pages.\n"
        "Always include the main URL itself first in your list if it appears in the input."
    ),
    "plan_profile": (
        "You are selecting pages from a brand's website to scrape for building a brand profile.\n"
        "Pick up to {max_pages} URLs that best explain what the company is and does:\n"
        "INCLUDE: homepage, services/solutions pages, about page, locations/markets overview, "
        "any franchise section pages (why franchise, investment, process).\n"
        "SKIP: individual location/store pages, blog archives, privacy/terms, press releases "
        "older than the main navigation.\n"
        "Always include the main URL itself first in your list if it appears in the input."
    ),
}


async def select_relevant_urls(
    urls: list[str],
    purpose: str,
    main_url: str,
    max_pages: int = 20,
) -> list[str]:
    """Have Claude pick the most relevant URLs for the given purpose.

    `main_url` is always attempted first (after stripping trailing slash) and is
    the fallback if the model returns nothing usable.

    `purpose` is "fact_sheet" or "plan_profile".
    """
    purpose_prompt = _URL_SELECTION_PROMPTS.get(purpose, _URL_SELECTION_PROMPTS["fact_sheet"])
    instructions = purpose_prompt.format(max_pages=max_pages)

    # Cap the rendered list at 300 URLs sent to the model
    capped = urls[:300]
    url_list_text = "\n".join(capped)

    prompt = (
        f"{instructions}\n\n"
        f"SITE URL LIST ({len(capped)} URLs):\n{url_list_text}\n\n"
        f"Return a JSON object with a single key 'urls' containing your selection "
        f"(up to {max_pages} items). Output only valid JSON."
    )

    client = get_client()
    resp = await client.messages.create(
        model=MODELS["sonnet"],
        max_tokens=4000,
        temperature=0.2,
        output_config={"format": {"type": "json_schema", "schema": URL_SELECTION_SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in resp.content if hasattr(b, "text"))

    try:
        data = extract_json(text)
        selected: list[str] = data.get("urls") or []
    except Exception as exc:
        logger.warning("select_relevant_urls: failed to parse Claude output: %s", exc)
        selected = []

    # Build a normalised lookup set from the input list
    def _norm(u: str) -> str:
        return u.rstrip("/").lower()

    input_norm: dict[str, str] = {}
    for u in urls:
        input_norm[_norm(u)] = u  # norm -> original

    main_norm = _norm(main_url)

    # Filter: keep only URLs that were actually in the input list
    seen: set[str] = set()
    validated: list[str] = []

    # Always try to put main_url first
    if main_norm in input_norm and main_norm not in seen:
        seen.add(main_norm)
        validated.append(input_norm[main_norm])

    for u in selected:
        n = _norm(u)
        if n in input_norm and n not in seen:
            seen.add(n)
            validated.append(input_norm[n])

    # Cap at max_pages
    validated = validated[:max_pages]

    # Fallback: if nothing survived validation, return the main URL alone
    if not validated:
        logger.warning(
            "select_relevant_urls: no valid URLs survived validation for purpose=%s; "
            "falling back to main_url",
            purpose,
        )
        # Try to use the canonical form from input_norm; otherwise the raw main_url
        return [input_norm.get(main_norm, main_url)]

    return validated


# ---------------------------------------------------------------------------
# Fact sheet extraction
# ---------------------------------------------------------------------------

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
        f"URL: {p.get('url', 'unknown')}\n{(p.get('content') or '')[:15000]}"
        for p in scraped_pages
    )
    client = get_client()
    resp = await client.messages.create(
        model=MODELS["sonnet"],
        max_tokens=4000,
        temperature=0.2,
        output_config={"format": {"type": "json_schema", "schema": FACT_SHEET_SCHEMA}},
        messages=[{"role": "user", "content": EXTRACTION_PROMPT.format(pages=pages_text)}],
    )
    text = "".join(b.text for b in resp.content if hasattr(b, "text"))
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

LIGHT_SEO_PLAN = (
    "SEO: Start the output with 'Title tag:' and 'Meta description:' suggestion lines, then "
    "the page itself with one H1 and descriptive H2 sections. Work the TARGET KEYWORDS "
    "above into the copy naturally where they genuinely fit - no usage counts, no "
    "stuffing. Readability and persuasion win every tradeoff."
)


def _fact_sheet_lines(fact_sheet: dict) -> list[str]:
    """Return non-empty fact-sheet fields as '- key: value' strings."""
    result = []
    for key in FACT_SHEET_FIELDS:
        val = fact_sheet.get(key)
        if val not in (None, "", []):
            result.append(f"- {key}: {val}")
    return result


def build_franchise_user_prompt(page_type: str, brand_name: str, fact_sheet: dict) -> str:
    spec = PAGE_TYPES[page_type]
    lines = [f"PAGE TO WRITE: {spec['label'].replace('[Brand]', brand_name)}", "", spec["brief"], ""]
    lines.append(FACT_DISCIPLINE)
    lines.append("")
    lines.append("FACT SHEET:")
    lines.extend(_fact_sheet_lines(fact_sheet))
    lines.append("")
    lines.append(LIGHT_SEO)
    return "\n".join(lines)


def build_franchise_user_prompt_from_plan(
    page_entry: dict,
    brand_name: str,
    fact_sheet: dict,
    competitor_context: str | None = None,
    pop_guidance: str | None = None,
) -> str:
    """Build a user prompt from a plan page entry (title, format, intent, rationale, etc.)."""
    title = page_entry.get("title") or "Untitled"
    fmt = page_entry.get("format") or ""
    intent = page_entry.get("intent") or ""
    rationale = page_entry.get("rationale") or ""
    serp_notes = page_entry.get("serp_notes") or ""
    target_keywords = page_entry.get("target_keywords") or []
    outline = page_entry.get("outline") or []

    lines: list[str] = []
    lines.append(f"PAGE TO WRITE: {title}")
    lines.append("")
    if fmt or intent:
        parts = []
        if fmt:
            parts.append(f"Format: {fmt}")
        if intent:
            parts.append(f"Intent: {intent}")
        lines.append(" | ".join(parts))
    lines.append("")
    if rationale:
        lines.append(f"WHY THIS PAGE (strategy context): {rationale}")
        lines.append("")
    if serp_notes:
        lines.append(f"SERP CONTEXT: {serp_notes}")
        lines.append("")
    if target_keywords:
        lines.append("TARGET KEYWORDS (work these in naturally where they fit - no counts, no stuffing):")
        for kw_entry in target_keywords:
            kw = kw_entry.get("kw") or ""
            volume = kw_entry.get("volume") or 0
            lines.append(f"- {kw} ({volume}/mo)")
        lines.append("")
    # POP guidance immediately after keywords block
    if pop_guidance:
        lines.append(pop_guidance)
        lines.append("")
    if outline:
        lines.append("COVER THIS STRUCTURE (H1 implied by the title):")
        for item in outline:
            h2 = item.get("h2") or ""
            note = item.get("note") or ""
            lines.append(f"- {h2}: {note}")
        lines.append("")
    # Competitor context after outline, before FACT_DISCIPLINE
    if competitor_context:
        lines.append(competitor_context)
        lines.append("")
    lines.append(FACT_DISCIPLINE)
    lines.append("")
    lines.append("FACT SHEET:")
    lines.extend(_fact_sheet_lines(fact_sheet))
    lines.append("")
    lines.append(LIGHT_SEO_PLAN)
    return "\n".join(lines)


async def gather_competitor_context(keyword: str, max_pages: int = 3) -> str | None:
    """Scrape top-ranking non-directory competitor pages for a keyword.

    Returns a formatted block for inclusion in the generation prompt, or None
    on any failure (SERP error, all scrapes empty). Never raises.
    """
    from app.services.serp import get_serp_results
    from app.services.scraper import scrape_url
    from app.services.franchise_plan import _domain, _is_directory

    try:
        serp = await get_serp_results(keyword)
    except Exception as exc:
        logger.warning("gather_competitor_context: SERP call failed for %r: %s", keyword, exc)
        return None

    organic = (serp.get("organic_results") or [])
    if not organic:
        logger.warning("gather_competitor_context: no organic results for %r", keyword)
        return None

    # Walk organic results; collect distinct domains, skip directories, cap at max_pages
    seen_domains: set[str] = set()
    target_urls: list[str] = []
    for result in organic:
        url = result.get("url") or ""
        if not url:
            continue
        dom = _domain(url)
        if _is_directory(dom):
            continue
        if dom in seen_domains:
            continue
        seen_domains.add(dom)
        target_urls.append(url)
        if len(target_urls) >= max_pages:
            break

    if not target_urls:
        logger.warning(
            "gather_competitor_context: all top results for %r were directories", keyword
        )
        return None

    # Scrape concurrently and excerpt (keeps pre-stream latency to one scrape's worth)
    scraped = await asyncio.gather(
        *(scrape_url(u) for u in target_urls), return_exceptions=True
    )
    pages: list[tuple[str, str]] = []
    for url, page in zip(target_urls, scraped):
        if isinstance(page, BaseException):
            logger.warning("gather_competitor_context: scrape failed for %s: %s", url, page)
            continue
        content = (page.get("content") or "").strip()
        if not content:
            logger.warning("gather_competitor_context: empty scrape for %s", url)
            continue
        pages.append((url, content[:6000]))

    if not pages:
        logger.warning(
            "gather_competitor_context: all scrapes empty/failed for keyword %r", keyword
        )
        return None

    lines: list[str] = [
        f"TOP-RANKING COMPETITOR PAGES for '{keyword}' - study what they cover and the "
        "language they use, then write something BETTER: cover what they cover, answer what "
        "they answer, close the gaps they leave, match the depth prospects evidently expect. "
        "NEVER copy phrasing, NEVER mention these competitors by name in the page.",
    ]
    for url, excerpt in pages:
        lines.append(f"--- {url} ---")
        lines.append(excerpt)

    return "\n".join(lines)


def render_pop_term_guidance(brief: dict) -> str | None:
    """Render POP term targets as a prompt guidance block.

    Returns None if term_targets is absent or empty.
    """
    term_targets: list[dict] = brief.get("term_targets") or []
    if not term_targets:
        return None

    # Top 25 by weight descending
    sorted_terms = sorted(term_targets, key=lambda t: t.get("weight") or 0, reverse=True)[:25]

    lines: list[str] = [
        "SEO TERM GUIDANCE (statistical analysis of what top-ranking pages use):",
    ]

    target_word_count = brief.get("target_word_count")
    if target_word_count:
        lines.append(f"Aim for roughly {target_word_count} words (top-ranking pages average this).")

    for t in sorted_terms:
        phrase = t.get("phrase") or ""
        target = t.get("target") or 0
        if not phrase:
            continue
        if target == 0:
            lines.append(f"- {phrase}: mention if natural")
        else:
            lo = max(1, target - 1)
            hi = target + 1
            lines.append(f"- {phrase}: aim for {lo}-{hi} uses")

    lines.append(
        "Readability beats exact counts. If a target would force awkward phrasing, "
        "use fewer. Never stuff."
    )
    return "\n".join(lines)
