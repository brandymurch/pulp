# Franchise Content Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Research-driven franchise content roadmap — crawl the brand's site, pull DataForSEO keyword volumes + SERPs, and have Opus draft-and-review a 30-50 page tiered plan whose entries generate through the existing franchise machinery.

**Architecture:** Two new services (`dataforseo_labs.py` thin API client; `franchise_plan.py` nine-stage orchestration with structured-output schemas and the draft→review planning calls), extensions to `routers/franchise.py` (plan job + CRUD + plan-driven generation), one JSONB column, and a Content plan section on the existing /franchise page. Spec: `docs/superpowers/specs/2026-06-10-franchise-content-planner-design.md` (read it; the quality-bar requirements there are normative for the prompts).

**Tech Stack:** FastAPI (Python 3.9 — `from __future__ import annotations`), anthropic SDK 0.96 (structured outputs), DataForSEO (existing basic-auth pattern in services/serp.py), Next.js App Router + TS.

**Testing note:** repo has no test suite by convention; verify via py_compile, import checks, scripted stage tests with mocks where prescribed, `npx tsc --noEmit`, `npx next build`.

**Conventions:** named exports frontend; commits end `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; branch `feat/franchise-planner`.

---

### Task 1: DB migration (orchestrator)

- [ ] Apply via Supabase MCP (project `zmwwhfkvqpijaaceppst`), name `add_brand_franchise_content_plan`:
```sql
ALTER TABLE brands ADD COLUMN IF NOT EXISTS franchise_content_plan JSONB;
```
- [ ] Mirror in `supabase-schema.sql` brands block (after `franchise_profile JSONB,`): `  franchise_content_plan JSONB,`
- [ ] Commit: `git add supabase-schema.sql && git commit -m "Add brands.franchise_content_plan"`

---

### Task 2: DataForSEO Labs client

**Files:** Create `backend/app/services/dataforseo_labs.py`

- [ ] **Step 1:** WebFetch `https://docs.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live/` (and if that 404s, the Labs overview page) to confirm the exact request body and response shape for the keyword_ideas live endpoint. Confirm: field names for seed keywords (`keywords`), `location_name`, `language_name`, response path to items with `keyword`, `keyword_info.search_volume`, `keyword_info.competition`.

- [ ] **Step 2:** Write the client following `backend/app/services/serp.py`'s conventions exactly (same basic-auth header construction from DATAFORSEO_LOGIN/PASSWORD, same httpx usage, same "empty result on missing creds vs raise" decision — EXCEPTION: per spec, missing creds must RAISE a clear error here, not silently degrade):

```python
"""DataForSEO Labs - keyword research data."""
from __future__ import annotations
import base64
import logging

import httpx

from app.config import DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD

logger = logging.getLogger(__name__)

KEYWORD_IDEAS_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live"


class DataForSeoError(RuntimeError):
    pass


async def keyword_ideas(
    seeds: list[str],
    location_name: str = "United States",
    limit: int = 300,
) -> list[dict]:
    """Return [{keyword, volume, competition}] for seed keywords, sorted by volume desc."""
    if not DATAFORSEO_LOGIN or not DATAFORSEO_PASSWORD:
        raise DataForSeoError(
            "DataForSEO credentials missing - set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD"
        )
    auth = base64.b64encode(f"{DATAFORSEO_LOGIN}:{DATAFORSEO_PASSWORD}".encode()).decode()
    payload = [{
        "keywords": seeds[:200],
        "location_name": location_name,
        "language_name": "English",
        "limit": limit,
    }]
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            KEYWORD_IDEAS_URL,
            json=payload,
            headers={"Authorization": f"Basic {auth}"},
        )
    if resp.status_code != 200:
        raise DataForSeoError(f"DataForSEO HTTP {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    # Adjust the result path below to the documented shape confirmed in Step 1.
    tasks = data.get("tasks") or []
    if not tasks or tasks[0].get("status_code", 0) >= 40000:
        raise DataForSeoError(
            f"DataForSEO task error: {tasks[0].get('status_message') if tasks else 'no tasks'}"
        )
    items = ((tasks[0].get("result") or [{}])[0].get("items")) or []
    out = []
    for it in items:
        info = it.get("keyword_info") or {}
        kw = it.get("keyword")
        vol = info.get("search_volume")
        if kw and vol is not None:
            out.append({
                "keyword": kw,
                "volume": vol,
                "competition": info.get("competition"),
            })
    out.sort(key=lambda x: x["volume"], reverse=True)
    return out
```

- [ ] **Step 3:** Verify: `cd backend && python3 -m py_compile app/services/dataforseo_labs.py`. Then a mocked-shape unit check inline (construct a fake response dict matching the documented shape, run the parsing logic via a small refactor if needed or by monkeypatching httpx — simplest: extract a pure `parse_keyword_ideas(data) -> list` function and test it with the documented sample response).
- [ ] **Step 4:** Commit `"Add DataForSEO Labs keyword ideas client"`.

---

### Task 3: Plan orchestration service

**Files:** Create `backend/app/services/franchise_plan.py`

The nine stages from the spec, as one `async def build_content_plan(brand, fact_sheet, site_urls, seed_keywords, set_stage) -> dict` where `set_stage(label: str)` is a callback the router uses to surface progress. Read the spec's "Research job stages" and "Planning prompt quality bar" sections — the quality-bar bullets must appear as explicit instructions in the drafting prompt.

Structure (write complete code; key elements):

- [ ] **Step 1:** Module constants: `PROFILE_SCHEMA` (services[], markets[], positioning, differentiators[], existing_franchise_content[], gaps[]), `SEEDS_SCHEMA` ({seeds: [str]}), `CLUSTERS_SCHEMA` ({clusters: [{name, keywords: [{kw, volume}], intent}]}), `PLAN_SCHEMA` matching the spec's data-model `pages` + top-level fields (tier enum now/next/later; status fixed "planned"; pillar_id nullable; outline [{h2, note}]). All `additionalProperties: false`, required fields listed.

- [ ] **Step 2:** Stage functions, each small and pure-ish:
  - `crawl_sites(urls)` — loop `scrape_url` (services/scraper), collect `{url, content}` for non-empty, `warnings` for empty (same detection as routers/franchise.py `_run_scrape_job`); raise RuntimeError listing reasons if zero non-empty.
  - `profile_brand(pages_text)` — Sonnet (`MODELS["sonnet"]`, temperature 0.2, structured output PROFILE_SCHEMA, max_tokens 2000).
  - `generate_seeds(profile, fact_sheet, user_seeds)` — Sonnet, SEEDS_SCHEMA, prompt: ~15 franchise-recruitment seeds spanning industry-franchise, cost/investment, geo, comparison terms; merge + dedupe with user seeds.
  - `cluster_keywords(keywords)` — Sonnet, CLUSTERS_SCHEMA, input = top ~120 by volume from Labs; instruct: 15-25 intent clusters, franchise-recruitment relevance filter (drop consumer-service intent), keep volumes attached.
  - `serp_for_clusters(clusters)` — for each cluster's top keyword call existing `get_serp_results` under `asyncio.Semaphore(3)`; capture top-10 `{domain, title}` per cluster; failures → cluster marked `serp_top: []` and counted; if more than half fail, raise.
  - `sample_competitor_structures(clusters)` — pick the 8 highest-volume clusters; for each, first result whose domain is NOT in a small directory blocklist constant `DIRECTORY_DOMAINS = {"franchisedirect.com", "franchisegator.com", "franchising.com", "franchisehelp.com", "entrepreneur.com", "franchiseopportunities.com"}`; scrape it (scrape_url); summarize H1/H2s via a cheap Haiku call (or regex headings from markdown — implementer's choice, note which); cap 8.
  - `draft_plan(bundle)` — **Opus** (`MODELS["opus"]`), structured output PLAN_SCHEMA, max_tokens 16000 (large roadmap), prompt embedding ALL quality-bar bullets from the spec verbatim-equivalent.
  - `review_plan(draft, bundle)` — **Opus**, same schema, prompt: "You are reviewing a draft roadmap against the research. Find coverage gaps vs the clusters, cannibalization (two pages on one cluster), rationales not grounded in the SERP data, tier misassignments, weak hub-and-spoke linkage. Output the corrected FINAL plan (full object, not a critique)."
  - `build_content_plan(...)` — sequences the stages with `set_stage("Crawling site")` etc. per spec labels, assembles the final dict per the spec's data model (generated_at via `time.strftime` UTC, site_urls, seed_keywords_used, brand_profile as a compact string render of the profile, clusters with serp_class left to the planner's notes but raw `serp_top` kept).
  - Claude calls go through the shared `get_client()` + `extract_json` from services/claude.py; streaming NOT needed (background thread).

- [ ] **Step 3:** Verify: py_compile; then a stage-level smoke with mocks: monkeypatch `scrape_url`, `keyword_ideas`, `get_serp_results`, and the Anthropic client (return canned structured outputs) and run `build_content_plan` end-to-end asserting the assembled dict has pages/clusters/stages called in order. Write this as a throwaway script run via python3 - <<EOF, not committed test infra.
- [ ] **Step 4:** Commit `"Add franchise content plan orchestration service"`.

---

### Task 4: Router + plan-driven generation

**Files:** Modify `backend/app/routers/franchise.py`, `backend/app/services/franchise.py`

- [ ] **Step 1:** services/franchise.py — add `build_franchise_user_prompt_from_plan(page_entry: dict, brand_name: str, fact_sheet: dict) -> str`: PAGE TO WRITE = entry title; brief = format + intent + rationale + serp_notes rendered as context; "TARGET KEYWORDS (use naturally, no counts):" list with volumes; the entry outline as "COVER THIS STRUCTURE:"; then FACT_DISCIPLINE, fact sheet lines, and LIGHT_SEO (reuse existing constants).

- [ ] **Step 2:** routers/franchise.py — add, following the existing scrape-job pattern exactly (same store/TTL or a second store dict, implementer's choice — keep eviction):
  - `class PlanRequest(BaseModel)`: brand_id (max 100), site_urls list 1-5, seed_keywords list ≤20 default [].
  - `POST /api/franchise/plan` — loads brand (404/503 as elsewhere), 400 if no `franchise_profile` fact sheet, spawns thread running `build_content_plan` with a `set_stage` that writes `_plan_jobs[job_id]["stage"]`; result stored on done.
  - `GET /api/franchise/plan/status/{job_id}` — `{status:"pending", stage}` | done + `{plan}` (popped) | error → 500 detail `f"Failed while {stage}: {err}"` (popped) | 404 restart hint.
  - `GET /api/franchise/plan/{brand_id}` → `{id, name, franchise_content_plan}`; `PUT` body `{franchise_content_plan: dict}` → update. NOTE route-ordering: `/api/franchise/plan/status/{job_id}` MUST be declared BEFORE `/api/franchise/plan/{brand_id}` or FastAPI will match "status" as a brand_id.
  - `FranchiseGenerateRequest` gains `plan_page_id: str | None = None`. In `generate_page`: when set, load `brand["franchise_content_plan"]`, find the page entry by id (400 with clear message if plan/entry missing), use `build_franchise_user_prompt_from_plan`; else existing behavior. Role block unchanged.

- [ ] **Step 3:** Verify: py_compile all touched; import check listing routes — expect the 3 new plan routes plus existing 5; confirm `/api/franchise/plan/status/{job_id}` precedes `/api/franchise/plan/{brand_id}` in the route list. Quick mocked check that generate with plan_page_id 400s when no plan.
- [ ] **Step 4:** Commit `"Add franchise plan endpoints and plan-driven generation"`.

---

### Task 5: Frontend — Content plan section

**Files:** Modify `frontend/src/lib/types.ts`, `frontend/src/app/(app)/franchise/page.tsx`

- [ ] **Step 1:** types.ts additions:
```typescript
export interface PlanKeyword { kw: string; volume: number; }
export interface PlanOutlineItem { h2: string; note: string; }
export interface PlanPage {
  id: string; tier: "now" | "next" | "later"; title: string; format: string;
  target_keywords: PlanKeyword[]; intent: string; rationale: string;
  serp_notes: string; outline: PlanOutlineItem[]; pillar_id: string | null;
  status: "planned" | "generated"; generation_id: string | null;
}
export interface PlanCluster {
  name: string; keywords: PlanKeyword[]; intent: string;
  serp_top?: { domain: string; title: string }[];
}
export interface FranchiseContentPlan {
  generated_at: string; site_urls: string[]; seed_keywords_used: string[];
  brand_profile: string; clusters: PlanCluster[]; pages: PlanPage[];
}
```

- [ ] **Step 2:** franchise/page.tsx — new `ContentPlanSection` (unexported inner component, like the others) rendered between the fact-sheet editor and the generation card, props: brandId, brandName, hasFactSheet, plus a callback `onGenerateFromPlan(page: PlanPage)` that the parent wires into the existing generation flow (sets a state holding the active plan entry; the generation card, when a plan entry is active, calls `generate("/api/franchise/generate", {brand_id, page_type: "franchise_why", plan_page_id: entry.id})` — page_type is still sent for schema validity but backend ignores it when plan_page_id present... CHECK the backend: if it validates page_type ∈ PAGE_TYPES first, keep sending a valid key; read the router to match). Save-to-history for a plan-driven generation uses the entry title as keyword and `content_type: "franchise_plan_page"`, then flips the entry status to generated + generation_id and PUTs the plan.
  - States: empty (no plan; URL textarea + seeds input + Build button, disabled without fact sheet with hint), building (poll `GET /api/franchise/plan/status/{job}` every 3s, show `stage`, failure cap 5, hard cap 15 min), loaded (tier-grouped table).
  - Table: group by tier with headings Now/Next/Later; row: title (editable inline on expand), format, top keyword + volume, status chip. Expanded: all keywords w/ volumes, intent, rationale, serp_notes, editable outline (one-per-line "H2 | note" textarea is acceptable — keep the raw-draft-state pattern from the fact-sheet fix: raw string while editing, parse on save), Delete row, Generate button.
  - Save plan (PUT) with dirty tracking; Generate-from-row persists first if dirty (spec requirement); Rebuild plan button with confirm note.
  - On mount with brand selected: GET plan endpoint; render loaded state if `franchise_content_plan` exists.
- [ ] **Step 3:** Verify: `cd frontend && npx tsc --noEmit && npx next build`.
- [ ] **Step 4:** Commit `"Add content plan section: build, review, generate from roadmap"`.

---

### Task 6: Final review + deploy (orchestrator)

- [ ] Final whole-branch review subagent (integration seams: plan entry → generate → save → status flip; route ordering; spec coverage vs both spec docs).
- [ ] Full verify: backend py_compile + import; frontend tsc + build.
- [ ] Merge `feat/franchise-planner` → main, push with the gh-token credential helper. Render auto-deploys.
- [ ] Live smoke test with user: build a real plan, inspect roadmap quality, generate one Now-tier page.
