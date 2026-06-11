# Franchise Content Planner

**Date:** 2026-06-10
**Status:** Approved direction (single-shot research job, full roadmap, franchise-dev only)
**Quality bar:** This is the product's strategic brain — the roadmap must read like a senior SEO strategist wrote it after a week of research. Every page recommendation must be grounded in real volume and SERP data, not vibes.

## Context

Extends the Franchise module (shipped earlier today). Instead of hand-picking page types, the user points Pulp at the brand's main website; Pulp researches the keyword landscape with DataForSEO, studies who ranks, and produces a full 30-50 page franchise-development content roadmap. Each roadmap entry can then be generated through the existing franchise generation machinery (brand voice, fact discipline, streaming).

Decisions from brainstorming:
- **Scope:** franchise development content only.
- **Size:** full roadmap (30-50 pages), tiered Now / Next / Later.
- **Shape:** one background research job, fully editable plan afterward (not interactive mid-flight).
- **DataForSEO is research-only** (SERP + Labs keyword data). It has no content-scoring product; scoring is out of scope here.

## User flow

1. Franchise page → new **Content plan** section (requires a saved fact sheet — it feeds brand context).
2. Enter the brand's main website URL(s) (1-5) and optional seed keywords → **Build content plan**.
3. Background job runs (4-10 min) with visible stage progress ("Crawling site", "Researching keywords", "Analyzing rankings", "Drafting roadmap", "Reviewing roadmap").
4. Job completes → roadmap renders grouped by tier. Each row expands to target keywords with volumes, intent, why-it-can-win rationale, SERP composition notes, and an editable outline. Titles and outlines are editable; rows can be deleted. **Save plan** persists it.
5. Per-row **Generate** feeds that entry's brief into the existing franchise generation (streamed, fact-disciplined). Saving the generated page marks the row `generated` and links the generation id.
6. **Rebuild plan** re-runs research after confirmation (overwrites on save).

## Research job stages (backend)

1. **Crawl** the provided URLs via the existing Firecrawl scraper (empty-content pages collected as warnings; zero successes fails the job with reasons).
2. **Brand profile** — one Sonnet call over the crawled text: services, geographic footprint, positioning, differentiators, existing franchise-content inventory and gaps. Structured output.
3. **Seed keywords** — Sonnet generates ~15 seeds from the profile + fact sheet (industry franchise terms, cost/investment terms, geo modifiers, comparison terms), merged with any user-provided seeds.
4. **Keyword data** — new DataForSEO Labs client: `keyword_ideas` live endpoint with the seeds → keywords with **search volume** and competition. One or two live calls; filter to franchise-intent keywords; keep top ~120 by volume. Auth identical to the existing SERP client. If DataForSEO credentials are missing, the job fails immediately with a clear message.
5. **Clustering** — Sonnet groups keywords into ~15-25 intent clusters (structured output): cluster name, keywords with volumes, dominant intent.
6. **SERP analysis** — existing `get_serp_results` for the top keyword of each cluster (semaphore ≤3 concurrent). Classify each SERP: directory-dominated (Franchise Direct/Gator etc.), competitor-brand-dominated, informational, or mixed — classification done in the planning call's input, with the raw top-10 domains+titles captured per cluster.
7. **Competitor structure sampling** — scrape the #1 non-directory result for the 8 highest-volume clusters (cap 8 scrapes); capture H1/H2 structure summaries.
8. **Roadmap drafting** — one **Opus** call (`MODELS["opus"]`, structured output against PLAN_SCHEMA) with the full bundle: brand profile, fact sheet, clusters with volumes, SERP compositions, competitor structures. Instructions encode the quality bar (below).
9. **Roadmap review pass** — a second call (Opus) that critiques the draft against the research (coverage gaps, cannibalization, weak rationales, tier misassignments) and outputs the corrected final plan. This is the "really really good" step — the plan never ships un-reviewed.

### Planning prompt quality bar (encoded in the prompt, verbatim requirements)

- 30-50 pages covering the full researched landscape; if the landscape genuinely supports fewer, say so rather than padding.
- No two pages may target the same keyword cluster (no cannibalization).
- Hub-and-spoke: identify 3-6 pillar pages; every spoke names its pillar (internal_links).
- Every page entry cites its target keywords WITH volumes and a rationale referencing the SERP evidence ("page one is directory-heavy, target the long-tail variant instead" / "competitor brand pages rank — beatable with stronger E-E-A-T").
- Tiering logic stated per tier: Now = high intent + winnable; Next = volume plays needing authority; Later = supporting/informational.
- Formats chosen from SERP evidence (guide, comparison, FAQ, location/state page, cost breakdown, etc.).
- Outlines are skeletons (H1 + 4-8 H2 with one-line notes), not full content.

## Data model

New JSONB column: `brands.franchise_content_plan` (migration + schema file):

```json
{
  "generated_at": "...", "site_urls": [...], "seed_keywords_used": [...],
  "brand_profile": "...",
  "clusters": [{"name": "...", "keywords": [{"kw": "...", "volume": 1300}],
                "intent": "...",
                "serp_top": [{"domain": "...", "title": "..."}]}],
  "pages": [{"id": "p1", "tier": "now|next|later", "title": "...", "format": "...",
             "target_keywords": [{"kw": "...", "volume": 1300}], "intent": "...",
             "rationale": "...", "serp_notes": "...",
             "outline": [{"h2": "...", "note": "..."}], "pillar_id": "p1|null",
             "status": "planned|generated", "generation_id": null}]
}
```

## Backend surface

- New `backend/app/services/dataforseo_labs.py` — `keyword_ideas(seeds, location) -> list[{keyword, volume, competition}]`, with `raise_for_status`-style error handling matching `serp.py`'s conventions; consult docs.dataforseo.com for the exact live-endpoint request shape during implementation.
- New `backend/app/services/franchise_plan.py` — the stage orchestration (steps 1-9), each stage updating the job dict's `stage` field for UI progress; PLAN_SCHEMA + planning/review prompts live here.
- `backend/app/routers/franchise.py` additions:
  - `POST /api/franchise/plan` `{brand_id, site_urls[1-5], seed_keywords?[≤20]}` → `{job_id}` (thread + poll; job dict carries `stage`)
  - `GET /api/franchise/plan/status/{job_id}` → `{status, stage}` | done + plan (not yet saved) | error with stage context
  - `GET /api/franchise/plan/{brand_id}` / `PUT /api/franchise/plan/{brand_id}` `{franchise_content_plan}` — load/save
  - `POST /api/franchise/generate` gains optional `plan_page_id`: when present, the user prompt is built from the saved plan entry (title, keywords+volumes, intent, outline, serp_notes) + fact sheet + FACT_DISCIPLINE + a keyword-aware LIGHT_SEO variant (use the actual target keywords naturally; still no counts/stuffing). 400 if plan or entry missing.
- Poll timing: plan jobs can run ~10 min; frontend hard cap 15 min for this poller.

## Frontend

`frontend/src/app/(app)/franchise/page.tsx` gains a **Content plan** section (below the fact sheet, above generation):
- Empty state: URL textarea (one per line), optional seeds input, Build button. Disabled with a hint if no saved fact sheet.
- Building state: stage label + elapsed, with the established failure-cap polling pattern (5 consecutive failures; 15-min hard cap).
- Plan state: tier-grouped table (Now/Next/Later), columns: title, format, top keyword + volume, status. Row expand: all keywords w/ volumes, intent, rationale, serp_notes, editable outline + title, delete row. Save plan / Rebuild plan buttons. Per-row Generate wires into the existing generation card flow (passes plan_page_id). Because the backend reads the SAVED plan, the Generate action first persists the plan if there are unsaved edits, then starts generation. After save-to-history, the row's status flips to generated with generation_id, and the plan auto-saves.
- All errors visible; types added to lib/types.ts (`FranchiseContentPlan`, `PlanPage`, `PlanCluster`).

## Error handling

- Missing DataForSEO creds → job fails at stage "Researching keywords" with an explicit message naming the env vars.
- Every stage failure carries the stage name in the job error ("Failed while analyzing rankings: ...").
- Partial SERP/scrape failures degrade gracefully (noted in plan input, never fatal if ≥half the clusters have SERP data).
- Plan JSON always schema-validated (structured outputs) — no fence-parsing.

## Verification

- py_compile + import check; `npx tsc --noEmit` + `next build`.
- Live smoke test: build a plan for the real brand (user has one configured), review roadmap quality together, generate one Now-tier page end to end.

## Out of scope

- Consumer/local content planning (franchise-dev only).
- Content scoring for franchise pages (possible later: Claude editorial rubric).
- Scheduling/automation of plan refresh; rank tracking.
