# Franchise Development Module + UI Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a brand-level franchise development content module (scrape → fact sheet → generate "Why Franchise" / "Investment & Fees" pages) and simplify the UI for internal use.

**Architecture:** New self-contained backend module (`services/franchise.py` + `routers/franchise.py`) reusing the existing scraper, Claude client, brand-voice prompt blocks, and SSE contract. Fact sheet persists in `brands.franchise_profile` JSONB. Frontend gets one new `/franchise` page; Overview is removed; Queue+History merge into `/pages`; Generate form collapses advanced fields.

**Tech Stack:** FastAPI (Python 3.9 — use `from __future__ import annotations`), Supabase (sync client), Anthropic SDK 0.96 (structured outputs available), Next.js App Router + TS + Tailwind.

**Testing note:** This repo has no test suite by convention (see CLAUDE.md) and the spec excludes new test infra. Steps verify via `python3 -m py_compile`, import checks, `npx next build`, and scripted endpoint checks instead of TDD.

**Conventions that bite:** named exports only in frontend (`export function Foo`); `npx next build` not vite; commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; push to main uses the gh-token credential helper (see memory `git-push-personal-account`).

---

### Task 1: Database migration

**Files:**
- Modify: `supabase-schema.sql` (root of repo)
- Live DB: apply via Supabase MCP `apply_migration` (project `zmwwhfkvqpijaaceppst`) — orchestrator step

- [ ] **Step 1: Check `generations.location_id` nullability + `content_type` existence**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'generations' AND column_name IN ('location_id', 'content_type');
```
Expected: `location_id` nullable YES. If `content_type` is missing or `location_id` is NO, include fixes in the migration below.

- [ ] **Step 2: Apply migration**

Via Supabase MCP `apply_migration`, name `add_brand_franchise_profile`:
```sql
ALTER TABLE brands ADD COLUMN IF NOT EXISTS franchise_profile JSONB;
-- only if Step 1 found issues:
-- ALTER TABLE generations ALTER COLUMN location_id DROP NOT NULL;
-- ALTER TABLE generations ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'landing_page';
```

- [ ] **Step 3: Mirror in `supabase-schema.sql`**

In the `brands` CREATE TABLE block, add after the last voice column:
```sql
  franchise_profile JSONB,
```

- [ ] **Step 4: Commit**
```bash
git add supabase-schema.sql && git commit -m "Add brands.franchise_profile for franchise fact sheets"
```

---

### Task 2: Franchise service — fact sheet extraction + page registry + prompts

**Files:**
- Create: `backend/app/services/franchise.py`

- [ ] **Step 1: Write the service**

```python
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
        f"URL: {p.get('url', 'unknown')}\n{(p.get('markdown') or p.get('content') or '')[:15000]}"
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
```

Note for implementer: confirm `extract_json` and `get_client` names exist in `app/services/claude.py` (added 2026-06-10); confirm the key each scraped page dict uses for its text (`markdown` vs `content`) by reading `services/scraper.py:_firecrawl`, and adjust the join line accordingly.

- [ ] **Step 2: Verify**
```bash
cd backend && python3 -m py_compile app/services/franchise.py && \
python3 -c "from app.services.franchise import PAGE_TYPES, build_franchise_user_prompt; \
print(build_franchise_user_prompt('franchise_why','Acme',{'franchise_fee':49500,'differentiators':['fast ramp']})[:400])"
```
Expected: compiles; prompt prints with fact lines and no `[Brand]` literal.

- [ ] **Step 3: Commit**
```bash
git add backend/app/services/franchise.py && git commit -m "Add franchise service: fact-sheet extraction and page prompts"
```

---

### Task 3: Franchise router — scrape job, profile CRUD, SSE generate

**Files:**
- Create: `backend/app/routers/franchise.py`
- Modify: `backend/main.py` (router registration, after line 37)

- [ ] **Step 1: Write the router**

```python
"""Franchise development module - scrape facts, manage profile, generate pages."""
from __future__ import annotations
import asyncio
import json
import logging
import threading
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.auth import require_auth
from app.db import get_db
from app.services.franchise import (
    PAGE_TYPES, build_franchise_user_prompt, extract_fact_sheet,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["franchise"])

_scrape_jobs: dict[str, dict[str, Any]] = {}
_JOB_TTL_SECONDS = 30 * 60


def _evict_stale_jobs() -> None:
    cutoff = time.time() - _JOB_TTL_SECONDS
    for key in [k for k, v in _scrape_jobs.items() if v.get("_created", 0) < cutoff]:
        _scrape_jobs.pop(key, None)


class ScrapeRequest(BaseModel):
    brand_id: str = Field(max_length=100)
    urls: list[str] = Field(min_length=1, max_length=10)


class ProfileUpdate(BaseModel):
    franchise_profile: dict


class FranchiseGenerateRequest(BaseModel):
    brand_id: str = Field(max_length=100)
    page_type: str = Field(max_length=50)


def _run_scrape_job(job_id: str, urls: list[str]):
    loop = asyncio.new_event_loop()
    try:
        from app.services.scraper import scrape_url

        async def run():
            results, errors = [], []
            for u in urls:
                try:
                    page = await scrape_url(u)
                    page["url"] = u
                    results.append(page)
                except Exception as e:
                    errors.append(f"{u}: {e}")
            if not results:
                raise RuntimeError("All scrapes failed: " + "; ".join(errors))
            sheet = await extract_fact_sheet(results)
            sheet["source_urls"] = urls
            sheet["scraped_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            return sheet, errors

        sheet, errors = loop.run_until_complete(run())
        _scrape_jobs[job_id] = {
            "status": "done", "fact_sheet": sheet, "scrape_errors": errors,
            "_created": time.time(),
        }
    except Exception as e:
        logger.exception("Franchise scrape job %s failed", job_id)
        _scrape_jobs[job_id] = {"status": "error", "error": str(e), "_created": time.time()}
    finally:
        loop.close()


@router.post("/api/franchise/scrape")
def start_scrape(req: ScrapeRequest, _auth: dict = Depends(require_auth)):
    _evict_stale_jobs()
    job_id = str(uuid.uuid4())
    _scrape_jobs[job_id] = {"status": "pending", "_created": time.time()}
    threading.Thread(target=_run_scrape_job, args=(job_id, req.urls), daemon=True).start()
    return {"job_id": job_id, "status": "pending"}


@router.get("/api/franchise/scrape/status/{job_id}")
def scrape_status(job_id: str, _auth: dict = Depends(require_auth)):
    _evict_stale_jobs()
    job = _scrape_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found. The server may have restarted. Please retry.")
    if job["status"] == "error":
        _scrape_jobs.pop(job_id, None)
        raise HTTPException(500, job["error"])
    if job["status"] == "done":
        _scrape_jobs.pop(job_id, None)
        return {"status": "done", "fact_sheet": job["fact_sheet"], "scrape_errors": job["scrape_errors"]}
    return {"status": "pending"}


@router.get("/api/franchise/profile/{brand_id}")
def get_profile(brand_id: str, _auth: dict = Depends(require_auth)):
    try:
        res = get_db().table("brands").select("id,name,franchise_profile").eq("id", brand_id).limit(1).execute()
    except Exception:
        raise HTTPException(503, "Database error")
    if not res.data:
        raise HTTPException(404, "Brand not found")
    return res.data[0]


@router.put("/api/franchise/profile/{brand_id}")
def save_profile(brand_id: str, body: ProfileUpdate, _auth: dict = Depends(require_auth)):
    try:
        res = get_db().table("brands").update(
            {"franchise_profile": body.franchise_profile}
        ).eq("id", brand_id).execute()
    except Exception:
        raise HTTPException(503, "Database error")
    if not res.data:
        raise HTTPException(404, "Brand not found")
    return {"ok": True}


@router.post("/api/franchise/generate")
async def generate_page(req: FranchiseGenerateRequest, _auth: dict = Depends(require_auth)):
    if req.page_type not in PAGE_TYPES:
        raise HTTPException(400, f"Unknown page_type. Valid: {list(PAGE_TYPES)}")
    try:
        res = get_db().table("brands").select("*").eq("id", req.brand_id).limit(1).execute()
    except Exception:
        raise HTTPException(503, "Database error")
    if not res.data:
        raise HTTPException(404, "Brand not found")
    brand = res.data[0]
    sheet = brand.get("franchise_profile")
    if not sheet:
        raise HTTPException(400, "No franchise fact sheet for this brand. Scrape or fill one in first.")

    from app.services.content_generator import build_system_prompt, with_role_block
    from app.services.claude import stream_claude, get_generation_model

    system_blocks = build_system_prompt(brand)  # implementer: match the real signature used by routers/generate.py
    system = with_role_block(system_blocks, "You write franchise development (franchisee recruitment) pages.")
    user_prompt = build_franchise_user_prompt(req.page_type, brand.get("name", ""), sheet)

    return StreamingResponse(
        stream_claude(system=system, user_prompt=user_prompt, model=get_generation_model()),
        media_type="text/event-stream",
    )
```

Implementer notes (resolve while writing, not after):
- Match `build_system_prompt`'s real signature by copying how `routers/generate.py` calls it (it takes brand voice fields, not the raw row, unless refactored otherwise on 2026-06-10 — read it).
- Match `stream_claude`'s real parameter names from `services/claude.py` and how `routers/generate.py` builds its `StreamingResponse` (copy that wrapper exactly, including any newline-delimited JSON framing).

- [ ] **Step 2: Register router**

In `backend/main.py`: add `franchise` to the routers import line and `app.include_router(franchise.router)` after the dashboard line.

- [ ] **Step 3: Verify**
```bash
cd backend && python3 -m py_compile app/routers/franchise.py main.py && \
PULP_DEV=1 SUPABASE_URL=http://x SUPABASE_ANON_KEY=x ANTHROPIC_API_KEY=x POP_API_KEY=x \
python3 -c "import main; print([r.path for r in main.app.routes if 'franchise' in r.path])"
```
Expected: lists all 5 franchise routes.

- [ ] **Step 4: Commit**
```bash
git add backend/app/routers/franchise.py backend/main.py && git commit -m "Add franchise router: scrape job, profile CRUD, SSE generation"
```

---

### Task 4: Frontend — types + Franchise page

**Files:**
- Modify: `frontend/src/lib/types.ts` (add franchise types)
- Create: `frontend/src/app/(app)/franchise/page.tsx`

- [ ] **Step 1: Add types to `frontend/src/lib/types.ts`**

```typescript
export interface FranchiseFactSheet {
  investment_min?: number | null;
  investment_max?: number | null;
  franchise_fee?: number | null;
  royalty_pct?: string | null;
  ad_fund_pct?: string | null;
  territory_model?: string | null;
  training_support?: string[];
  process_steps?: string[];
  differentiators?: string[];
  ideal_candidate?: string | null;
  proof_points?: string[];
  source_urls?: string[];
  scraped_at?: string;
}

export const FRANCHISE_PAGE_TYPES = [
  { key: "franchise_why", label: "Why Franchise With Us" },
  { key: "franchise_investment", label: "Investment & Fees" },
] as const;
```

- [ ] **Step 2: Build the page**

`frontend/src/app/(app)/franchise/page.tsx` — named-export inner component wrapped in a default export (match `generate/page.tsx`'s Suspense pattern only if `useSearchParams` is used; it is not here, so a plain component is fine). Structure (write real JSX following the visual style of `generate/page.tsx` — same Tailwind classes for cards/inputs/buttons):

1. Brand `<select>` (load via `apiFetch("/api/brands")` on mount; error state on failure).
2. On brand select: `apiFetch(`/api/franchise/profile/${brandId}`)`. If `franchise_profile` is null → show the scrape card: textarea for URLs (one per line), "Scrape & extract" button → `POST /api/franchise/scrape`, then poll `GET /api/franchise/scrape/status/{job_id}` every 3s with the same failure-cap pattern used in `generate/page.tsx` (stop after 5 consecutive failures; 10-min hard cap). On done: load result into the editor (NOT yet saved) and show any `scrape_errors` in an amber banner.
3. Fact sheet editor: inputs for each scalar field, one-per-line textareas for list fields (`training_support`, `process_steps`, `differentiators`, `proof_points`). "Save fact sheet" → `PUT /api/franchise/profile/{brandId}` via `apiFetchOk`, success/error feedback. "Re-scrape" button (visible when a sheet exists) opens the scrape card again with a confirmation note that saving will overwrite.
4. Generation card: one button per entry in `FRANCHISE_PAGE_TYPES`; clicking calls the existing `useGeneration().generate("/api/franchise/generate", { brand_id: brandId, page_type: key } as never)` — check `GenerationPayload` type and widen it (e.g. `payload: GenerationPayload | FranchiseGeneratePayload`) rather than casting.
5. Output panel: streamed markdown text in the same `<pre>`/rendered style generate uses, with Copy button and "Save to history" → `apiFetchOk("/api/generations", { method: "POST", body: JSON.stringify({ brand_id: brandId, keyword: pageLabel, content: output, content_type: pageKey }) })` — check `GenerationCreate` required fields in `backend/app/models.py` and supply them (keyword is required; use the page label).

- [ ] **Step 3: Verify**
```bash
cd frontend && npx tsc --noEmit && npx next build
```
Expected: clean type check, build exit 0 with `/franchise` route listed.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/lib/types.ts "frontend/src/app/(app)/franchise/page.tsx" && \
git commit -m "Add franchise development page: scrape, fact sheet editor, generation"
```

---

### Task 5: Rail + Overview removal + redirects

**Files:**
- Modify: `frontend/src/components/shell/Rail.tsx:97-100+`
- Delete: `frontend/src/app/(app)/overview/` (entire folder)
- Modify: `frontend/src/app/page.tsx` (root redirect)

- [ ] **Step 1: Update Rail nav items**

Replace the items array (keep existing icon components; reuse `OverviewIcon` for nothing — delete it if unused after this):
```typescript
const NAV_ITEMS = [
  { label: "Generate", href: "/generate", icon: <GenerateIcon /> },
  { label: "Pages", href: "/pages", icon: <HistoryIcon /> },
  { label: "Franchise", href: "/franchise", icon: <QueueIcon /> },
  { label: "Locations", href: "/locations", icon: <LocationsIcon /> },
  { label: "Voice", href: "/voice", icon: <VoiceIcon /> },
];
```
(Keep whatever the file's actual array variable name and icon names are — read lines 90-115 first.)

- [ ] **Step 2: Delete Overview, fix redirects**

- `rm -rf "frontend/src/app/(app)/overview"`
- In `frontend/src/app/page.tsx`: ensure the root redirects to `/generate` (it may currently point at `/overview` — read it; if it's a sign-in gate, point its post-auth target at `/generate`).
- Grep for remaining references: `grep -rn "overview" frontend/src/ --include='*.tsx'` and fix each.

- [ ] **Step 3: Verify + commit**
```bash
cd frontend && npx next build   # expect: no /overview route, no broken imports
git add -A frontend/src && git commit -m "Simplify nav: drop Overview, add Franchise and Pages entries"
```

---

### Task 6: Merge Queue + History into /pages

**Files:**
- Create: `frontend/src/app/(app)/pages/page.tsx`
- Delete: `frontend/src/app/(app)/queue/` and `frontend/src/app/(app)/history/` (after content is moved)

- [ ] **Step 1: Build the merged page**

`pages/page.tsx` composes the two existing bodies, top to bottom:
- Section "In progress": lift the job list + polling + approve/outline-review UI from `queue/page.tsx` (keep its `ACTIVE_PIPELINE_PHASES` usage, failure caps, `handleApprove` with feedback body).
- Section "Finished pages": lift the list + detail view from `history/page.tsx` (it already uses the shared `Generation` type and `GenerationsList` component).
- Hide the "In progress" section entirely when there are zero active jobs (less chrome for the common case).
- Franchise generations (content_type starting `franchise_`) render their page-type label where city/keyword normally shows: map via `FRANCHISE_PAGE_TYPES`.
- While merging, tighten row padding/typography one notch on both lists (the spec's "denser tables" item) — reuse existing Tailwind scale, e.g. `py-3` → `py-2`, no new components.

- [ ] **Step 2: Delete old routes and fix links**

```bash
rm -rf "frontend/src/app/(app)/queue" "frontend/src/app/(app)/history"
grep -rn '"/queue"\|"/history"' frontend/src/   # fix every hit to /pages
```
Known link sources: Rail (done in Task 5), generate page's post-start "view in queue" link if present, location history links.

- [ ] **Step 3: Verify + commit**
```bash
cd frontend && npx next build   # expect /pages route; /queue and /history gone
git add -A frontend/src && git commit -m "Merge queue and history into single Pages screen"
```

---

### Task 7: Slim the Generate form

**Files:**
- Modify: `frontend/src/app/(app)/generate/page.tsx` (form JSX section)

- [ ] **Step 1: Restructure the form**

- Keep visible: brand select, location select, keyword input, Generate button.
- Move into a collapsed disclosure (`<details>` styled like existing cards, or a `useState` toggle button labeled "More options"): content type select, feedback/notes textarea, competitor URLs input, page slug input.
- Default collapsed; auto-expand if any advanced field already has a value (e.g. arriving via URL params).

- [ ] **Step 2: Verify + commit**
```bash
cd frontend && npx next build
git add "frontend/src/app/(app)/generate/page.tsx" && git commit -m "Collapse advanced generate options behind More options"
```

---

### Task 8: Final verification + deploy

- [ ] **Step 1: Full check**
```bash
cd backend && python3 -m py_compile $(find app -name '*.py') && \
PULP_DEV=1 SUPABASE_URL=http://x SUPABASE_ANON_KEY=x ANTHROPIC_API_KEY=x POP_API_KEY=x python3 -c "import main; print('OK')"
cd ../frontend && npx tsc --noEmit && npx next build
```

- [ ] **Step 2: Push to main (auto-deploys on Render)**
```bash
git -c credential.helper= -c credential.helper='!f() { echo username=brandymurch; echo "password=$(gh auth token -u brandymurch)"; }; f' push origin main
```

- [ ] **Step 3: Live smoke test (orchestrator + user)**
- Open /franchise, pick a brand, scrape a real franchise dev site, review extracted sheet, save.
- Generate "Why Franchise With Us", confirm stream + fact discipline (no invented numbers; `[CONFIRM: ...]` markers where facts were missing).
- Save to history; confirm it appears under Finished pages on /pages with the page-type label.
- Confirm /generate still runs a cached-city pipeline end to end (regression).
