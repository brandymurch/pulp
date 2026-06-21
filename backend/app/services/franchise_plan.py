"""Franchise content plan - research orchestration, planning + review prompts.

Pipeline (one background job, 8 visible stages):
  crawl sites -> brand profile -> seed keywords -> keyword data -> clustering
  -> SERP analysis -> competitor structure sampling -> roadmap draft (Opus)
  -> roadmap review (Opus).

The two Opus prompts at the bottom of this file are the product: the roadmap
must read like a senior SEO strategist wrote it after a week of research.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, Callable
from urllib.parse import urlparse

from app.services.claude import MODELS, get_client, extract_json
from app.services.dataforseo_labs import keyword_ideas
from app.services.scraper import scrape_url
from app.services.serp import get_serp_results

logger = logging.getLogger(__name__)

PAGE_CONTENT_CAP = 12000   # chars of each crawled page fed to the profile call
MAX_KEYWORDS = 120         # keep top-N keywords by volume from DataForSEO
MAX_COMPETITOR_SAMPLES = 8

DIRECTORY_DOMAINS = {
    "franchisedirect.com",
    "franchisegator.com",
    "franchising.com",
    "franchisehelp.com",
    "entrepreneur.com",
    "franchiseopportunities.com",
    "ifranchisegroup.com",
    "franchimp.com",
}


# ---------------------------------------------------------------------------
# Structured output schemas
# ---------------------------------------------------------------------------

PROFILE_SCHEMA = {
    "type": "object",
    "properties": {
        "services": {"type": "array", "items": {"type": "string"}},
        "markets": {"type": "array", "items": {"type": "string"}},
        "positioning": {"type": "string"},
        "differentiators": {"type": "array", "items": {"type": "string"}},
        "existing_franchise_content": {"type": "array", "items": {"type": "string"}},
        "gaps": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "services", "markets", "positioning", "differentiators",
        "existing_franchise_content", "gaps",
    ],
    "additionalProperties": False,
}

SEEDS_SCHEMA = {
    "type": "object",
    "properties": {
        "seeds": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["seeds"],
    "additionalProperties": False,
}

_KEYWORD_ITEM = {
    "type": "object",
    "properties": {
        "kw": {"type": "string"},
        "volume": {"type": "number"},
    },
    "required": ["kw", "volume"],
    "additionalProperties": False,
}

CLUSTERS_SCHEMA = {
    "type": "object",
    "properties": {
        "clusters": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "keywords": {"type": "array", "items": _KEYWORD_ITEM},
                    "intent": {"type": "string"},
                },
                "required": ["name", "keywords", "intent"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["clusters"],
    "additionalProperties": False,
}

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "pages": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "tier": {"type": "string", "enum": ["now", "next", "later"]},
                    "title": {"type": "string"},
                    "format": {"type": "string"},
                    "target_keywords": {"type": "array", "items": _KEYWORD_ITEM},
                    "intent": {"type": "string"},
                    "rationale": {"type": "string"},
                    "serp_notes": {"type": "string"},
                    "outline": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "h2": {"type": "string"},
                                "note": {"type": "string"},
                            },
                            "required": ["h2", "note"],
                            "additionalProperties": False,
                        },
                    },
                    "pillar_id": {"type": ["string", "null"]},
                },
                "required": [
                    "id", "tier", "title", "format", "target_keywords",
                    "intent", "rationale", "serp_notes", "outline", "pillar_id",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["pages"],
    "additionalProperties": False,
}


# ---------------------------------------------------------------------------
# Claude call helper (matches franchise.py: get_client + output_config + extract_json)
# ---------------------------------------------------------------------------

async def _call_claude(
    model_key: str,
    prompt: str,
    schema: dict,
    max_tokens: int,
    temperature: float | None = None,
) -> Any:
    """Structured-output Claude call. temperature=None omits the param.

    Uses streaming so long Opus calls don't hit the HTTP read-timeout;
    structured outputs are supported in streaming mode.
    """
    client = get_client()
    kwargs: dict[str, Any] = {
        "model": MODELS[model_key],
        "max_tokens": max_tokens,
        "output_config": {"format": {"type": "json_schema", "schema": schema}},
        "messages": [{"role": "user", "content": prompt}],
    }
    if temperature is not None:
        kwargs["temperature"] = temperature
    async with client.messages.stream(**kwargs) as stream:
        resp = await stream.get_final_message()
    if resp.stop_reason == "max_tokens":
        raise RuntimeError(
            "Claude response hit the output token limit before completing"
            " - the roadmap was too large for the budget"
        )
    text = "".join(b.text for b in resp.content if hasattr(b, "text"))
    # Normalize em/en-dashes to hyphens before parsing (Claude emits literal
    # unicode dashes; this also covers the rare — escape path).
    text = text.replace("—", "-").replace("–", "-")
    return extract_json(text)


# ---------------------------------------------------------------------------
# Stage 1: crawl
# ---------------------------------------------------------------------------

async def crawl_sites(urls: list[str]) -> tuple[list[dict], list[str]]:
    """Scrape each URL concurrently. Empty content -> warning. Zero successes -> RuntimeError.

    Results are ordered to match the input URL list. Scrapes run at most
    5-concurrent (mirrors serp_for_clusters) to avoid hammering Firecrawl with
    ~20 simultaneous requests.
    """
    sem = asyncio.Semaphore(5)

    async def _fetch(u: str) -> tuple[dict | None, str | None]:
        try:
            async with sem:
                page = await scrape_url(u)
            if not (page.get("content") or "").strip():
                reason = page.get("error") or (
                    "scraper returned error source" if page.get("source") == "error"
                    else "scrape returned no content"
                )
                return None, f"{u}: {reason}"
            return {"url": u, "content": page["content"]}, None
        except Exception as e:
            return None, f"{u}: {e}"

    results = await asyncio.gather(*(_fetch(u) for u in urls))
    pages: list[dict] = []
    warnings: list[str] = []
    for page, warn in results:
        if warn:
            warnings.append(warn)
        if page:
            pages.append(page)
    if not pages:
        raise RuntimeError("All site crawls failed: " + "; ".join(warnings))
    return pages, warnings


# ---------------------------------------------------------------------------
# Stage 2: brand profile
# ---------------------------------------------------------------------------

PROFILE_PROMPT = """You are profiling a brand to plan its franchise development (franchisee recruitment) content. Extract a franchise-development-relevant brand profile from these scraped pages of the brand's website.

Extract:
- services: what the business does for its customers (the service lines a franchisee would operate).
- markets: the brand's geographic footprint - states, regions, metro areas mentioned or implied by locations.
- positioning: a short paragraph on how the brand positions itself in its market.
- differentiators: what the brand claims sets it apart (for customers or for franchisees).
- existing_franchise_content: what franchisee-recruitment content already exists on these pages - pages or sections aimed at PROSPECTIVE FRANCHISEES (own a franchise, investment info, why franchise with us, etc.). List what is actually there.
- gaps: what a prospective franchisee evaluating this brand would want to know that these pages do NOT answer.

Use only what is in the text. Do not invent services, markets, or claims.

SCRAPED PAGES:
{pages}"""


async def profile_brand(pages: list[dict]) -> dict:
    pages_text = "\n\n---\n\n".join(
        f"URL: {p.get('url', 'unknown')}\n{(p.get('content') or '')[:PAGE_CONTENT_CAP]}"
        for p in pages
    )
    return await _call_claude(
        "sonnet",
        PROFILE_PROMPT.format(pages=pages_text),
        PROFILE_SCHEMA,
        max_tokens=2000,
        temperature=0.2,
    )


# ---------------------------------------------------------------------------
# Stage 3: seed keywords
# ---------------------------------------------------------------------------

SEEDS_PROMPT = """Generate ~15 seed keywords for franchise-development keyword research. These seeds go into DataForSEO's keyword ideas endpoint, so they should be short, natural search phrases (2-5 words) that prospective FRANCHISEES would type - people looking to BUY a franchise in this industry, not consumers looking to hire the service.

Cover all five of these angles:
1. Industry head terms: "[industry] franchise", "[industry] franchise opportunities".
2. Cost / investment terms: "[industry] franchise cost", "[industry] franchise fee", "franchise under $100k" style affordability terms relevant to this brand's investment level.
3. Geographic terms: "franchise opportunities [state/region]" using the brand's actual markets below.
4. Comparison / best-of terms: "best [industry] franchises", "[industry] franchise reviews".
5. Adjacent how-to terms: "how to start a [industry] business", "owning a [industry] business".

Use the brand's industry and markets from the profile below. Lowercase, no punctuation, no duplicates. Prefer non-branded terms (the research is about the landscape, not the brand's own name).

BRAND PROFILE:
{profile}

FACT SHEET:
{fact_sheet}"""


async def generate_seeds(profile: dict, fact_sheet: dict, user_seeds: list[str]) -> list[str]:
    prompt = SEEDS_PROMPT.format(
        profile=_render_profile(profile),
        fact_sheet=_render_fact_sheet(fact_sheet),
    )
    data = await _call_claude("sonnet", prompt, SEEDS_SCHEMA, max_tokens=1000, temperature=0.2)
    generated = [s.strip() for s in (data.get("seeds") or []) if isinstance(s, str) and s.strip()]
    merged: list[str] = []
    seen: set[str] = set()
    for s in list(user_seeds or []) + generated:
        key = (s or "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            merged.append(s.strip())
    return merged


# ---------------------------------------------------------------------------
# Stage 4: keyword data
# ---------------------------------------------------------------------------

async def research_keywords(seeds: list[str]) -> list[dict]:
    """DataForSEO Labs keyword ideas -> top MAX_KEYWORDS by volume (already sorted desc)."""
    keywords = await keyword_ideas(seeds)
    if not keywords:
        raise RuntimeError("Keyword research returned no keywords for the generated seeds")
    return keywords[:MAX_KEYWORDS]


# ---------------------------------------------------------------------------
# Stage 5: clustering
# ---------------------------------------------------------------------------

CLUSTERS_PROMPT = """You are organizing keyword research for a FRANCHISE DEVELOPMENT content plan - pages aimed at prospective franchisees evaluating buying a franchise.

Group the keywords below into 15-25 intent clusters.

Rules:
- DROP any keyword with consumer service intent - someone looking to HIRE the service rather than BUY a franchise (e.g. "plumber near me" is consumer intent and must be dropped; "plumbing franchise cost" is franchise intent and stays). Be strict: ambiguous local-service queries get dropped.
- Every kept keyword goes into exactly one cluster.
- Preserve each keyword's search volume from the input EXACTLY - never change or invent volumes.
- Sort each cluster's keywords by volume, highest first.
- name: short and descriptive (e.g. "Franchise cost & fees", "Best-of comparisons", "Texas opportunities").
- intent: the dominant searcher intent for the cluster (e.g. "cost diligence", "comparison shopping", "opportunity discovery", "how-to / informational", "financing", "conversion / brand evaluation").

KEYWORDS (keyword | monthly volume):
{keywords}"""


async def cluster_keywords(keywords: list[dict]) -> list[dict]:
    lines = "\n".join(f"{k['keyword']} | {k['volume']}" for k in keywords)
    data = await _call_claude(
        "sonnet",
        CLUSTERS_PROMPT.format(keywords=lines),
        CLUSTERS_SCHEMA,
        max_tokens=8000,
        temperature=0.2,
    )
    clusters = data.get("clusters") or []
    for c in clusters:
        c["keywords"] = sorted(
            c.get("keywords") or [], key=lambda k: k.get("volume") or 0, reverse=True
        )
    return [c for c in clusters if c.get("keywords")]


# ---------------------------------------------------------------------------
# Stage 6: SERP analysis
# ---------------------------------------------------------------------------

def _domain(url: str) -> str:
    netloc = urlparse(url or "").netloc.lower()
    return netloc[4:] if netloc.startswith("www.") else netloc


def _is_directory(domain: str) -> bool:
    return any(domain == d or domain.endswith("." + d) for d in DIRECTORY_DOMAINS)


async def serp_for_clusters(clusters: list[dict]) -> tuple[list[dict], list[str]]:
    """Fetch top-10 organic results for each cluster's top keyword (<=3 concurrent).

    Attaches serp_top = [{domain, title}] per cluster (and a private _serp_urls
    list used for competitor sampling, stripped before final assembly).
    Per-cluster failure -> serp_top [] + warning. >half failed -> RuntimeError.
    """
    sem = asyncio.Semaphore(3)
    warnings: list[str] = []

    async def fetch(cluster: dict) -> bool:
        cluster["serp_top"] = []
        cluster["_serp_urls"] = []
        kws = cluster.get("keywords") or []
        if not kws:
            return False
        top_kw = kws[0]["kw"]
        try:
            async with sem:
                serp = await get_serp_results(top_kw)
            organic = (serp.get("organic_results") or [])[:10]
            if not organic:
                warnings.append(f"SERP for '{top_kw}': no organic results returned")
                return False
            for r in organic:
                url = r.get("url") or ""
                cluster["serp_top"].append(
                    {"domain": _domain(url), "title": r.get("title") or ""}
                )
                cluster["_serp_urls"].append(url)
            return True
        except Exception as e:
            warnings.append(f"SERP for '{top_kw}' failed: {e}")
            return False

    results = await asyncio.gather(*(fetch(c) for c in clusters))
    failed = sum(1 for ok in results if not ok)
    if clusters and failed > len(clusters) / 2:
        raise RuntimeError(
            "SERP analysis mostly failed: " + "; ".join(warnings[:5])
        )
    return clusters, warnings


# ---------------------------------------------------------------------------
# Stage 7: competitor structure sampling
# ---------------------------------------------------------------------------

async def sample_competitor_structures(clusters: list[dict]) -> tuple[list[dict], list[str]]:
    """Scrape the first non-directory SERP result for the 8 highest-volume clusters.

    Heading structure is pulled from the markdown by regex (#/## lines) - no
    extra LLM call. Failures are skipped with a warning.
    """
    warnings: list[str] = []
    structures: list[dict] = []

    def cluster_volume(c: dict) -> float:
        kws = c.get("keywords") or []
        return kws[0].get("volume") or 0 if kws else 0

    candidates = sorted(
        [c for c in clusters if c.get("serp_top")], key=cluster_volume, reverse=True
    )[:MAX_COMPETITOR_SAMPLES]

    for cluster in candidates:
        target_url, target_domain = None, None
        for entry, url in zip(cluster["serp_top"], cluster.get("_serp_urls") or []):
            dom = entry.get("domain") or ""
            if url and dom and not _is_directory(dom):
                target_url, target_domain = url, dom
                break
        name = cluster.get("name") or "?"
        if not target_url:
            warnings.append(f"Cluster '{name}': no non-directory result to sample")
            continue
        try:
            page = await scrape_url(target_url)
        except Exception as e:
            warnings.append(f"Competitor scrape failed for {target_url}: {e}")
            continue
        content = page.get("content") or ""
        if not content.strip():
            warnings.append(f"Competitor scrape returned no content for {target_url}")
            continue
        matches = re.findall(r"^(#{1,2})\s+(.+)$", content, re.MULTILINE)[:30]
        if not matches:
            warnings.append(f"No headings found on {target_url}")
            continue
        structures.append({
            "cluster": name,
            "domain": target_domain,
            "url": target_url,
            "headings": [
                f"{'H1' if hashes == '#' else 'H2'}: {text.strip()}"
                for hashes, text in matches
            ],
        })
    return structures, warnings


# ---------------------------------------------------------------------------
# Research bundle rendering (shared by the two Opus prompts)
# ---------------------------------------------------------------------------

def _render_profile(profile: dict) -> str:
    def fmt(v: Any) -> str:
        return "; ".join(str(x) for x in v) if isinstance(v, list) else str(v)
    lines = []
    for label, key in (
        ("Services", "services"),
        ("Markets", "markets"),
        ("Positioning", "positioning"),
        ("Differentiators", "differentiators"),
        ("Existing franchise content", "existing_franchise_content"),
        ("Gaps", "gaps"),
    ):
        val = (profile or {}).get(key)
        if val:
            lines.append(f"{label}: {fmt(val)}")
    return "\n".join(lines) or "(no profile extracted)"


def _render_fact_sheet(fact_sheet: dict) -> str:
    lines = []
    for key, val in (fact_sheet or {}).items():
        if key in ("source_urls", "scraped_at"):
            continue
        if val in (None, "", []):
            continue
        lines.append(f"- {key}: {val}")
    return "\n".join(lines) or "(no fact sheet facts)"


def _render_clusters(clusters: list[dict]) -> str:
    blocks = []
    for c in clusters:
        kws = ", ".join(
            f"{k['kw']} ({k['volume']}/mo)" for k in (c.get("keywords") or [])
        )
        serp = (
            "\n".join(
                f"    {i + 1}. {r.get('domain', '?')} - {r.get('title', '')}"
                for i, r in enumerate(c.get("serp_top") or [])
            )
            or "    (no SERP data for this cluster)"
        )
        blocks.append(
            f"CLUSTER: {c.get('name', '?')}\n"
            f"  Intent: {c.get('intent', '?')}\n"
            f"  Keywords: {kws}\n"
            f"  Top-10 SERP for top keyword:\n{serp}"
        )
    return "\n\n".join(blocks) or "(no clusters)"


def _render_competitors(structures: list[dict]) -> str:
    blocks = []
    for s in structures:
        heads = "\n".join(f"    {h}" for h in s.get("headings") or [])
        blocks.append(
            f"RANKING PAGE for cluster '{s.get('cluster', '?')}' "
            f"({s.get('domain', '?')}):\n{heads}"
        )
    return "\n\n".join(blocks) or "(no competitor structures sampled)"


def _render_warnings(warnings: list[str]) -> str:
    if not warnings:
        return "(none - research completed cleanly)"
    return "\n".join(f"- {w}" for w in warnings)


def _render_bundle(bundle: dict) -> str:
    return (
        "=== BRAND ===\n"
        f"Brand name: {bundle.get('brand_name', 'the brand')}\n\n"
        f"{_render_profile(bundle.get('profile') or {})}\n\n"
        "=== FACT SHEET (verified franchise facts - the only numbers you may cite about the brand) ===\n"
        f"{_render_fact_sheet(bundle.get('fact_sheet') or {})}\n\n"
        "=== KEYWORD CLUSTERS WITH VOLUMES AND SERP EVIDENCE ===\n"
        f"{_render_clusters(bundle.get('clusters') or [])}\n\n"
        "=== HEADING STRUCTURES OF PAGES CURRENTLY RANKING (sampled) ===\n"
        f"{_render_competitors(bundle.get('competitor_structures') or [])}\n\n"
        "=== RESEARCH WARNINGS (data gaps to keep in mind) ===\n"
        f"{_render_warnings(bundle.get('warnings') or [])}"
    )


# ---------------------------------------------------------------------------
# Stage 8: roadmap drafting (Opus) - THE PROMPT IS THE PRODUCT
# ---------------------------------------------------------------------------

DRAFT_PLAN_INSTRUCTIONS = """You are a senior SEO strategist who has just finished a week of keyword and SERP research for a franchise brand. Produce the brand's complete franchise development content roadmap: the set of pages that will own the franchisee-recruitment keyword landscape for this industry.

AUDIENCE: prospective franchisees evaluating a six-figure investment - NOT consumers shopping for the service. Every page in this plan is recruitment content.

WHO READS YOUR PLAN: a marketing team that will build these pages one at a time. Every entry must be concrete enough to brief a writer from, and every recommendation must be defensible from the research below - volume data and SERP evidence, not vibes.

HARD REQUIREMENTS - the plan is rejected if any of these are violated:

1. SCOPE: 30-50 pages covering the FULL researched landscape. Only plan fewer if the landscape genuinely does not support 30 quality pages - and if so, say why in the rationales rather than padding the plan with redundant or invented pages.

2. ONE PAGE PER CLUSTER: no two pages may target the same keyword cluster. Cannibalization is an automatic failure. If two clusters overlap heavily, serve both with a single page and say so in that page's rationale.

3. HUB-AND-SPOKE ARCHITECTURE: designate 3-6 pillar pages - the broad, high-volume hub topics. Pillar pages set "pillar_id": null. Every other page is a spoke and MUST set "pillar_id" to the id of the pillar it feeds. No orphan pages.

4. EVIDENCE IN EVERY RATIONALE: every page cites its target keywords WITH their search volumes taken verbatim from the cluster data, and the rationale must reference the actual SERP evidence captured for that cluster:
   - Page one dominated by franchise directories (Franchise Direct, Franchise Gator, Entrepreneur, etc.)? A single brand site rarely outranks an aggregator on the head term - target the cluster's long-tail variants instead and say so explicitly.
   - Page one dominated by competitor brand pages? Beatable - state HOW: more transparent investment data, stronger E-E-A-T (real franchisee proof points, founder story, named leadership), a better-structured comparison, fresher and more specific content.
   - Informational SERP (guides, how-tos, listicles)? Match the format: plan a guide or FAQ, not a sales page.
   - Record the SERP composition observation for the page's cluster in "serp_notes".

5. TIER LOGIC, applied per page and defensible from the data:
   - "now" = high purchase intent AND winnable per the SERP evidence (long-tail, weak or beatable competition, or ground only the brand can own). These convert and can rank early.
   - "next" = real volume plays that need domain authority built first before they can win.
   - "later" = supporting and informational pages that build topical authority and feed the pillars.

6. FORMAT FROM SERP EVIDENCE: choose each page's "format" (guide, cost breakdown, comparison, FAQ, state/territory page, pillar hub, checklist, financing explainer, franchisee story, etc.) from what actually ranks in that cluster's SERP - not from habit.

7. OUTLINES ARE SKELETONS: the H1 is implied by the title. Give 4-8 H2 entries per page, each with a one-line note on what that section must cover. Where heading structures of currently-ranking pages are provided below, plan to BEAT them - cover what they cover, then close the gaps they leave. Never copy them.

8. TITLES A REAL MARKETING TEAM WOULD SHIP: human, specific, and clickable. "How Much Does a Plumbing Franchise Cost? The Full Investment Breakdown" - never keyword-stuffed strings like "plumbing franchise cost fees price investment".

9. COVER THE FULL FRANCHISEE JOURNEY. Think about the prospective franchisee's path and make sure every stage has coverage:
   - Awareness: "how to start a business in this industry", industry outlook, is this a good business to own.
   - Comparison: best-of lists, brand-vs-brand pages, alternatives to bigger competitors.
   - Cost diligence: investment breakdowns, fees, FDD explainers, financing, earnings questions.
   - Conversion: why this brand, the path to ownership, ideal candidate, available territories.
   The high-intent stages should dominate the "now" tier.

10. STAY INSIDE THE RESEARCH: target keywords and volumes must come from the cluster data verbatim - never invent keywords or volumes. Claims about the brand come only from the brand profile and fact sheet. Where the research has warnings or gaps, plan conservatively rather than guessing.

11. BE COMPACT - the plan must fit the output budget across 30-50 pages: rationale is at most 2 tight sentences, serp_notes at most 1 sentence, each outline note at most 10 words. Density of insight, not length, is what gets graded.

THE RESEARCH:

"""


async def draft_plan(bundle: dict) -> dict:
    prompt = DRAFT_PLAN_INSTRUCTIONS + _render_bundle(bundle)
    return await _call_claude("opus", prompt, PLAN_SCHEMA, max_tokens=30000)


# ---------------------------------------------------------------------------
# Stage 9: roadmap review (Opus)
# ---------------------------------------------------------------------------

REVIEW_PLAN_INSTRUCTIONS = """You are a skeptical head of SEO. A junior strategist has handed you the franchise development content roadmap below, drafted from the research that follows it. Your name goes on this plan, so review it ruthlessly against the research, fix every problem you find, and output the corrected final plan.

CHECK ALL OF THESE:

1. COVERAGE GAPS: clusters with meaningful search volume that no page targets. Add pages for them, or fold them into an existing page's target keywords only if the intent is genuinely identical.
2. CANNIBALIZATION: two or more pages targeting the same cluster or substantially the same keywords. Merge or retarget so each cluster has exactly one page.
3. UNGROUNDED RATIONALES: rationales that do not match the SERP evidence shown for the cluster - e.g. calling a SERP "beatable" when the data shows it is directory-dominated, or citing keywords/volumes that are not in the cluster data. Rewrite them against the actual evidence.
4. TIER MISASSIGNMENTS: "now" pages that are not both high-intent AND winnable; high-intent winnable pages buried in "later". Reassign using the tier logic: now = high intent + winnable; next = volume plays needing authority; later = supporting/informational.
5. BROKEN PILLAR STRUCTURE: pillar_id values pointing at nonexistent ids or at pages that are not pillars; orphan spokes with no pillar; fewer than 3 or more than 6 pillars. Fix the hub-and-spoke architecture.
6. PADDING: redundant, thin, or invented pages that exist only to inflate the count. Cut them - a tight plan beats a padded one.
7. KEYWORD-STUFFED TITLES: rewrite any title a real marketing team would refuse to ship.
8. OUTLINE QUALITY: every outline must be a skeleton of 4-8 H2s with a one-line note each (H1 implied by the title). Trim bloated outlines, flesh out thin ones, and make sure the sections actually answer the page's intent.
9. COMPACTNESS: the corrected plan must fit the output budget - rationale at most 2 sentences, serp_notes at most 1 sentence, outline notes at most 10 words. Tighten anything longer.

OUTPUT: the complete corrected plan - the FULL pages array, including every page you kept unchanged. Do NOT output a critique, commentary, or a diff. What you output ships as-is.

THE DRAFT PLAN UNDER REVIEW:

{draft}

THE RESEARCH IT MUST BE JUDGED AGAINST:

"""


async def review_plan(draft: dict, bundle: dict) -> dict:
    prompt = (
        REVIEW_PLAN_INSTRUCTIONS.replace(
            "{draft}", json.dumps(draft, indent=1, ensure_ascii=False)
        )
        + _render_bundle(bundle)
    )
    return await _call_claude("opus", prompt, PLAN_SCHEMA, max_tokens=30000)


# ---------------------------------------------------------------------------
# Assembly helpers
# ---------------------------------------------------------------------------

def _normalize_pages(pages: list[dict]) -> list[dict]:
    """Stamp status/generation_id and re-id pages p1..pN; remap pillar_id."""
    id_map: dict[str, str] = {}
    out: list[dict] = []
    for i, raw in enumerate(pages, start=1):
        new_id = f"p{i}"
        old = raw.get("id")
        if old and old not in id_map:
            id_map[old] = new_id
        page = dict(raw)
        page["id"] = new_id
        out.append(page)
    for page, raw in zip(out, pages):
        pillar = raw.get("pillar_id")
        # Unknown pillar refs resolve to None; the review pass is responsible for pillar hygiene.
        page["pillar_id"] = id_map.get(pillar) if pillar else None
        if page["pillar_id"] == page["id"]:
            page["pillar_id"] = None
        page["status"] = "planned"
        page["generation_id"] = None
    return out


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

async def build_content_plan(
    brand: dict,
    fact_sheet: dict,
    site_urls: list[str],
    seed_keywords: list[str],
    set_stage: Callable[[str], None],
) -> dict:
    """Run the full research pipeline and return the franchise_content_plan dict."""
    brand_name = (brand or {}).get("name") or "the brand"
    warnings: list[str] = []

    set_stage("Crawling site")
    logger.info("Stage: crawling %d site URL(s)", len(site_urls))
    pages, crawl_warnings = await crawl_sites(site_urls)
    warnings.extend(crawl_warnings)
    if crawl_warnings:
        logger.info("Crawl warnings: %s", "; ".join(crawl_warnings))

    set_stage("Profiling brand")
    logger.info("Stage: profiling brand from %d crawled page(s)", len(pages))
    profile = await profile_brand(pages)

    set_stage("Researching keywords")
    logger.info("Stage: generating seed keywords")
    seeds = await generate_seeds(profile, fact_sheet, seed_keywords)
    logger.info("Stage: fetching keyword data for %d seeds", len(seeds))
    keywords = await research_keywords(seeds)

    set_stage("Clustering keywords")
    logger.info("Stage: clustering %d keywords", len(keywords))
    clusters = await cluster_keywords(keywords)
    if not clusters:
        raise RuntimeError("Clustering produced no franchise-intent keyword clusters")
    logger.info("Clustering produced %d clusters", len(clusters))

    set_stage("Analyzing rankings")
    logger.info("Stage: SERP analysis for %d clusters", len(clusters))
    clusters, serp_warnings = await serp_for_clusters(clusters)
    warnings.extend(serp_warnings)
    if serp_warnings:
        logger.info("SERP warnings: %s", "; ".join(serp_warnings))

    set_stage("Studying competitors")
    logger.info("Stage: sampling competitor structures")
    structures, comp_warnings = await sample_competitor_structures(clusters)
    warnings.extend(comp_warnings)
    if comp_warnings:
        logger.info("Competitor sampling warnings: %s", "; ".join(comp_warnings))

    bundle = {
        "brand_name": brand_name,
        "profile": profile,
        "fact_sheet": fact_sheet or {},
        "clusters": clusters,
        "competitor_structures": structures,
        "warnings": warnings,
    }

    set_stage("Drafting roadmap")
    logger.info("Stage: drafting roadmap (Opus)")
    draft = await draft_plan(bundle)
    logger.info("Draft produced %d page(s)", len((draft.get("pages") or [])))

    set_stage("Reviewing roadmap")
    logger.info("Stage: reviewing roadmap (Opus)")
    final = await review_plan(draft, bundle)

    final_pages = _normalize_pages(final.get("pages") or [])
    if not final_pages:
        raise RuntimeError("Plan review returned no pages")

    for c in clusters:
        c.pop("_serp_urls", None)

    return {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "site_urls": list(site_urls),
        "seed_keywords_used": seeds,
        "brand_profile": _render_profile(profile),
        "clusters": clusters,
        "pages": final_pages,
    }
