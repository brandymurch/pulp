# Competitor Grounding for FranDev Plan Generation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground FranDev plan-page generation in live competitor content (always-on SERP scrape) and add an opt-in POP term-target boost per plan row.

**Architecture:** Two new pure helpers in `franchise.py` (`gather_competitor_context`, `render_pop_term_guidance`) consumed by an extended `build_franchise_user_prompt_from_plan`. The router's `generate_page` plan-path calls the helpers pre-stream. Frontend adds a per-row `popBoost` checkbox that threads `pop_boost` into the generate payload.

**Tech Stack:** Python 3.9 FastAPI (backend), Next.js 15 App Router React 19 TypeScript (frontend), existing `serp.py` / `scraper.py` / `pop.py` / `franchise_plan.py` services.

---

## File Map

| File | Change |
|------|--------|
| `backend/app/services/franchise.py` | Add `gather_competitor_context`, `render_pop_term_guidance`; extend `build_franchise_user_prompt_from_plan` signature |
| `backend/app/routers/franchise.py` | Add `pop_boost` field to `FranchiseGenerateRequest`; orchestrate pre-stream research in plan path |
| `frontend/src/lib/types.ts` | Add `pop_boost?: boolean` to `FranchiseGeneratePayload` |
| `frontend/src/app/(app)/frandev/page.tsx` | Per-row POP boost checkbox; thread `pop_boost` through generate call; pre-stream status line; banner suffix |

---

## Task 1: `gather_competitor_context` helper

**Files:**
- Modify: `backend/app/services/franchise.py` (end of file, after `build_franchise_user_prompt_from_plan`)

### Context you need before coding

`get_serp_results(keyword)` returns `{"organic_results": [{"url": "...", ...}, ...], ...}`.

`scrape_url(url)` returns `{"content": "...", "source": "...", ...}`. Returns an error-shape (non-empty dict, `content=""`) rather than raising; `content` may be empty string.

`DIRECTORY_DOMAINS` and `_is_directory(domain)` live in `franchise_plan.py`. Import them from there — do NOT duplicate.

`_domain(url)` also lives in `franchise_plan.py`. Import it too; it parses netloc and strips `www.`.

The existing imports at the top of `franchise.py` are:
```python
from app.services.claude import MODELS, get_client, extract_json
import logging
logger = logging.getLogger(__name__)
```
You must add the new service imports inside the function body to avoid circular imports (the pattern used elsewhere in this codebase for cross-service calls).

- [ ] **Step 1: Add the helper to franchise.py**

Open `backend/app/services/franchise.py`. Append after `build_franchise_user_prompt_from_plan` (end of file):

```python
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

    # Scrape and excerpt
    pages: list[tuple[str, str]] = []
    for url in target_urls:
        try:
            page = await scrape_url(url)
        except Exception as exc:
            logger.warning("gather_competitor_context: scrape failed for %s: %s", url, exc)
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
```

- [ ] **Step 2: Inline smoke check**

```bash
cd /Users/brandym/projects/pulp/backend
python3 -c "
import asyncio
from unittest.mock import AsyncMock, patch

async def test():
    fake_serp = {
        'organic_results': [
            {'url': 'https://franchisedirect.com/x', 'title': 'dir'},
            {'url': 'https://goodfranchise.com/why', 'title': 'Good'},
            {'url': 'https://empty-site.com/page', 'title': 'Empty'},
        ]
    }
    fake_good = {'content': 'Great content about franchise opportunity ' * 100}
    fake_empty = {'content': ''}

    async def fake_scrape(url):
        if 'empty' in url:
            return fake_empty
        return fake_good

    with patch('app.services.serp.get_serp_results', new=AsyncMock(return_value=fake_serp)), \
         patch('app.services.scraper.scrape_url', new=fake_scrape):
        from app.services.franchise import gather_competitor_context
        result = await gather_competitor_context('plumbing franchise cost')
        assert result is not None, 'Expected non-None'
        assert 'franchisedirect.com' not in result, 'Directory domain leaked in'
        assert 'goodfranchise.com' in result, 'Good page missing'
        assert 'empty-site.com' not in result, 'Empty page should be excluded'
        assert 'NEVER copy phrasing' in result, 'Header missing'
        print('gather_competitor_context: PASS')

asyncio.run(test())
"
```

Expected: `gather_competitor_context: PASS`

---

## Task 2: `render_pop_term_guidance` helper

**Files:**
- Modify: `backend/app/services/franchise.py` (append after `gather_competitor_context`)

### Shape of `brief` you receive

`get_enriched_brief` returns a dict with `"term_targets": [{"phrase": str, "weight": float, "target": int}, ...]` and `"target_word_count": int`. Both may be absent/empty.

- [ ] **Step 1: Add the helper**

Append after `gather_competitor_context` in `franchise.py`:

```python
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
```

- [ ] **Step 2: Inline smoke check**

```bash
cd /Users/brandym/projects/pulp/backend
python3 -c "
from app.services.franchise import render_pop_term_guidance

# Test 1: normal brief with word count
brief = {
    'target_word_count': 1800,
    'term_targets': [
        {'phrase': 'franchise opportunity', 'weight': 10, 'target': 3},
        {'phrase': 'franchise cost', 'weight': 8, 'target': 1},
        {'phrase': 'passive income', 'weight': 5, 'target': 0},
    ]
}
result = render_pop_term_guidance(brief)
assert result is not None, 'Expected non-None'
assert '1800 words' in result, 'Word count missing'
assert 'franchise opportunity: aim for 2-4 uses' in result, 'Range wrong for target=3'
assert 'franchise cost: aim for 1-2 uses' in result, 'Range wrong for target=1 (lo=max(1,0)=1)'
assert 'passive income: mention if natural' in result, 'target=0 case wrong'
assert 'Never stuff' in result, 'Footer missing'
print('Test 1 (normal brief): PASS')

# Test 2: empty term_targets -> None
assert render_pop_term_guidance({'term_targets': []}) is None, 'Empty should return None'
print('Test 2 (empty): PASS')

# Test 3: missing term_targets -> None
assert render_pop_term_guidance({}) is None, 'Missing key should return None'
print('Test 3 (missing key): PASS')

# Test 4: target=1 -> lo=max(1,0)=1, hi=2
brief4 = {'term_targets': [{'phrase': 'plumbing franchise', 'weight': 9, 'target': 1}]}
r4 = render_pop_term_guidance(brief4)
assert 'plumbing franchise: aim for 1-2 uses' in r4, f'target=1 lo/hi wrong: {r4}'
print('Test 4 (target=1): PASS')

# Test 5: no word count in brief
brief5 = {'term_targets': [{'phrase': 'franchise fee', 'weight': 7, 'target': 2}]}
r5 = render_pop_term_guidance(brief5)
assert 'Aim for roughly' not in r5, 'Should not show word count when absent'
print('Test 5 (no word count): PASS')
"
```

Expected: all five `PASS` lines.

---

## Task 3: Extend `build_franchise_user_prompt_from_plan`

**Files:**
- Modify: `backend/app/services/franchise.py` — update the signature and body of `build_franchise_user_prompt_from_plan`

### Insertion rules

- `competitor_context` goes AFTER the outline section and BEFORE `FACT_DISCIPLINE`.
- `pop_guidance` goes right AFTER the TARGET KEYWORDS block.
- When both are `None`, output is byte-for-byte identical to current behaviour.

- [ ] **Step 1: Update the function signature and body**

The current function ends at line ~303. Replace it entirely with this version:

```python
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
```

- [ ] **Step 2: Inline smoke check**

```bash
cd /Users/brandym/projects/pulp/backend
python3 -c "
from app.services.franchise import build_franchise_user_prompt_from_plan

page = {
    'title': 'Why Franchise With Us',
    'format': 'guide',
    'intent': 'conversion',
    'rationale': 'High intent',
    'serp_notes': 'Directory dominated',
    'target_keywords': [{'kw': 'plumbing franchise', 'volume': 500}],
    'outline': [{'h2': 'Benefits', 'note': 'List the benefits'}],
}
sheet = {'royalty_pct': '6%'}

# Test 1: no context, no guidance — baseline
base = build_franchise_user_prompt_from_plan(page, 'Acme', sheet)
assert 'FACT DISCIPLINE' in base
assert 'COVER THIS STRUCTURE' in base
assert 'TARGET KEYWORDS' in base
print('Test 1 (baseline): PASS')

# Test 2: with competitor_context — must appear AFTER outline, BEFORE FACT_DISCIPLINE
ctx = 'TOP-RANKING COMPETITOR PAGES for xyz'
with_ctx = build_franchise_user_prompt_from_plan(page, 'Acme', sheet, competitor_context=ctx)
outline_pos = with_ctx.find('COVER THIS STRUCTURE')
ctx_pos = with_ctx.find(ctx)
fact_pos = with_ctx.find('FACT DISCIPLINE')
assert outline_pos < ctx_pos < fact_pos, f'Order wrong: outline={outline_pos} ctx={ctx_pos} fact={fact_pos}'
print('Test 2 (competitor_context position): PASS')

# Test 3: with pop_guidance — must appear AFTER TARGET KEYWORDS, BEFORE outline
guidance = 'SEO TERM GUIDANCE (statistical analysis'
with_pop = build_franchise_user_prompt_from_plan(page, 'Acme', sheet, pop_guidance=guidance)
kw_pos = with_pop.find('TARGET KEYWORDS')
pop_pos = with_pop.find(guidance)
outline_pos2 = with_pop.find('COVER THIS STRUCTURE')
assert kw_pos < pop_pos < outline_pos2, f'POP order wrong: kw={kw_pos} pop={pop_pos} outline={outline_pos2}'
print('Test 3 (pop_guidance position): PASS')

# Test 4: both None -> output identical to baseline
no_extras = build_franchise_user_prompt_from_plan(page, 'Acme', sheet, competitor_context=None, pop_guidance=None)
assert no_extras == base, 'Output changed when both None'
print('Test 4 (None args = unchanged): PASS')
"
```

Expected: all four `PASS` lines.

---

## Task 4: Router — `pop_boost` field + pre-stream orchestration

**Files:**
- Modify: `backend/app/routers/franchise.py`

### Changes needed

1. Add `pop_boost: bool = False` to `FranchiseGenerateRequest`.
2. In the `plan_page_id` branch of `generate_page`, before building `user`:
   - Extract `top_keyword` from `page_entry["target_keywords"][0]["kw"]` (if any).
   - `await gather_competitor_context(top_keyword)` — always attempted, assigned to `competitor_context`.
   - If `req.pop_boost` and `top_keyword`: call `get_enriched_brief` in try/except → `render_pop_term_guidance(brief)`, log warning on exception, set `pop_guidance = None` on failure.
3. Pass both into `build_franchise_user_prompt_from_plan`.
4. Import the two new helpers at the top of the file's import block.

The non-plan path is **unchanged**.

- [ ] **Step 1: Update imports in routers/franchise.py**

The current import from services/franchise is:
```python
from app.services.franchise import (
    PAGE_TYPES, build_franchise_user_prompt, build_franchise_user_prompt_from_plan,
    extract_fact_sheet,
)
```

Change it to:
```python
from app.services.franchise import (
    PAGE_TYPES, build_franchise_user_prompt, build_franchise_user_prompt_from_plan,
    extract_fact_sheet, gather_competitor_context, render_pop_term_guidance,
)
```

- [ ] **Step 2: Add `pop_boost` to `FranchiseGenerateRequest`**

Current model (lines 76-80):
```python
class FranchiseGenerateRequest(BaseModel):
    brand_id: str = Field(max_length=100)
    page_type: str = Field(default="", max_length=50)
    plan_page_id: str | None = None
```

Change to:
```python
class FranchiseGenerateRequest(BaseModel):
    brand_id: str = Field(max_length=100)
    page_type: str = Field(default="", max_length=50)
    plan_page_id: str | None = None
    pop_boost: bool = False
```

- [ ] **Step 3: Update the plan-path in `generate_page`**

Find the plan-path block (currently):
```python
    if req.plan_page_id is not None:
        plan = brand.get("franchise_content_plan")
        if not plan:
            raise HTTPException(400, "No saved content plan for this brand.")
        pages = plan.get("pages") or []
        page_entry = next((p for p in pages if p.get("id") == req.plan_page_id), None)
        if page_entry is None:
            raise HTTPException(400, f"Plan page {req.plan_page_id} not found.")
        user = build_franchise_user_prompt_from_plan(page_entry, brand.get("name", ""), sheet)
```

Replace with:
```python
    if req.plan_page_id is not None:
        plan = brand.get("franchise_content_plan")
        if not plan:
            raise HTTPException(400, "No saved content plan for this brand.")
        pages = plan.get("pages") or []
        page_entry = next((p for p in pages if p.get("id") == req.plan_page_id), None)
        if page_entry is None:
            raise HTTPException(400, f"Plan page {req.plan_page_id} not found.")

        # --- Competitor grounding pre-work ---
        kws = page_entry.get("target_keywords") or []
        top_keyword = kws[0].get("kw") if kws else None

        competitor_context: str | None = None
        if top_keyword:
            competitor_context = await gather_competitor_context(top_keyword)

        pop_guidance: str | None = None
        if req.pop_boost and top_keyword:
            try:
                from app.services.pop import get_enriched_brief
                brief = await get_enriched_brief(keyword=top_keyword)
                pop_guidance = render_pop_term_guidance(brief)
            except Exception as exc:
                logger.warning(
                    "POP boost failed for keyword %r (non-blocking): %s", top_keyword, exc
                )

        user = build_franchise_user_prompt_from_plan(
            page_entry, brand.get("name", ""), sheet,
            competitor_context=competitor_context,
            pop_guidance=pop_guidance,
        )
```

- [ ] **Step 4: Verify py_compile**

```bash
cd /Users/brandym/projects/pulp/backend
python3 -m py_compile app/services/franchise.py app/routers/franchise.py && echo "COMPILE OK"
```

Expected: `COMPILE OK` with no output before it.

- [ ] **Step 5: Full import check**

```bash
cd /Users/brandym/projects/pulp/backend
PULP_DEV=1 SUPABASE_URL=http://x SUPABASE_ANON_KEY=x ANTHROPIC_API_KEY=x POP_API_KEY=x \
  python3 -c "import main; print('IMPORT OK')"
```

Expected: `IMPORT OK`

---

## Task 5: Frontend — types.ts

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add `pop_boost` to `FranchiseGeneratePayload`**

Current (lines 134-138):
```typescript
export interface FranchiseGeneratePayload {
  brand_id: string;
  page_type?: string;
  plan_page_id?: string;
}
```

Change to:
```typescript
export interface FranchiseGeneratePayload {
  brand_id: string;
  page_type?: string;
  plan_page_id?: string;
  pop_boost?: boolean;
}
```

---

## Task 6: Frontend — frandev/page.tsx

**Files:**
- Modify: `frontend/src/app/(app)/frandev/page.tsx`

### What to add

1. A `popBoostMap: Record<string, boolean>` state in `ContentPlanSection` — maps `page.id -> bool`.
2. A checkbox inside the expanded row actions area (before the Generate button) with label "POP term boost" and a muted hint "(uses 1 POP run, cached 30 days)".
3. `onGenerateFromPlan` signature changes from `(page: PlanPage) => void` to `(page: PlanPage, popBoost: boolean) => void` — update the interface, the parent's handler, and the call site.
4. In `FranchisePageInner.handleGenerateFromPlan`: read the `popBoost` param, include it in the payload.
5. Generation card banner: if `activePlanPage && popBoostActive` (track `popBoostActive: boolean` in parent state), append " + POP boost" to the title line. Also show a muted status line "Researching competitors before writing..." when `isGenerating && !output && activePlanPage`.

- [ ] **Step 1: Update `ContentPlanSectionProps` interface**

Find:
```typescript
interface ContentPlanSectionProps {
  brandId: string;
  hasFactSheet: boolean;
  onGenerateFromPlan: (page: PlanPage) => void;
  /** Set by parent after a plan-page generation is saved to history. */
  planPageUpdate: { pageId: string; generationId: string | null } | null;
  /** Parent calls this after ContentPlanSection has consumed the update. */
  onPlanPageUpdateApplied: () => void;
}
```

Replace with:
```typescript
interface ContentPlanSectionProps {
  brandId: string;
  hasFactSheet: boolean;
  onGenerateFromPlan: (page: PlanPage, popBoost: boolean) => void;
  /** Set by parent after a plan-page generation is saved to history. */
  planPageUpdate: { pageId: string; generationId: string | null } | null;
  /** Parent calls this after ContentPlanSection has consumed the update. */
  onPlanPageUpdateApplied: () => void;
}
```

- [ ] **Step 2: Add `popBoostMap` state inside `ContentPlanSection`**

Find the line:
```typescript
  // Per-page outline drafts: pageId -> raw textarea string
  const [outlineDrafts, setOutlineDrafts] = useState<Record<string, string>>({});
```

After it, add:
```typescript
  // Per-row POP boost checkbox state: pageId -> boolean
  const [popBoostMap, setPopBoostMap] = useState<Record<string, boolean>>({});
```

- [ ] **Step 3: Update `handleGenerateFromPlan` inside `ContentPlanSection`**

Find (inside `ContentPlanSection`):
```typescript
  async function handleGenerateFromPlan(page: PlanPage) {
    if (!plan) return;
    // If dirty, flush + save first
    if (dirty) {
      const flushed = flushDraftsToPlan(plan);
      setPlan(flushed);
      const ok = await savePlan(flushed);
      if (!ok) return; // error already surfaced
    }
    onGenerateFromPlan(page);
  }
```

Replace with:
```typescript
  async function handleGenerateFromPlan(page: PlanPage, popBoost: boolean) {
    if (!plan) return;
    // If dirty, flush + save first
    if (dirty) {
      const flushed = flushDraftsToPlan(plan);
      setPlan(flushed);
      const ok = await savePlan(flushed);
      if (!ok) return; // error already surfaced
    }
    onGenerateFromPlan(page, popBoost);
  }
```

- [ ] **Step 4: Add checkbox and update Generate button call site in the expanded row**

Find the expanded row actions div:
```typescript
                        {/* Row actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="ink"
                            size="sm"
                            onClick={() => handleGenerateFromPlan(page)}
                          >
                            Generate
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePage(page.id)}
                          >
                            Delete row
                          </Button>
                        </div>
```

Replace with:
```typescript
                        {/* Row actions */}
                        <div className="space-y-2 pt-1">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={popBoostMap[page.id] ?? false}
                              onChange={(e) =>
                                setPopBoostMap((prev) => ({
                                  ...prev,
                                  [page.id]: e.target.checked,
                                }))
                              }
                              className="w-[14px] h-[14px] accent-ink cursor-pointer"
                            />
                            <span className="text-[12px] text-ink-70">POP term boost</span>
                            <span className="text-[11px] text-ink-40">(uses 1 POP run, cached 30 days)</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ink"
                              size="sm"
                              onClick={() =>
                                handleGenerateFromPlan(page, popBoostMap[page.id] ?? false)
                              }
                            >
                              Generate
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePage(page.id)}
                            >
                              Delete row
                            </Button>
                          </div>
                        </div>
```

- [ ] **Step 5: Add `popBoostActive` state and update `handleGenerateFromPlan` in `FranchisePageInner`**

Find in `FranchisePageInner`:
```typescript
  const [activePageType, setActivePageType] = useState<string | null>(null);
  const [activePlanPage, setActivePlanPage] = useState<PlanPage | null>(null);
```

After those two lines, add:
```typescript
  const [popBoostActive, setPopBoostActive] = useState(false);
```

- [ ] **Step 6: Update `handleGenerateFromPlan` in `FranchisePageInner` to accept and use `popBoost`**

Find:
```typescript
  // ---------------------------------------------------------------------------
  // Generate from plan page
  // ---------------------------------------------------------------------------
  function handleGenerateFromPlan(page: PlanPage) {
    setActivePlanPage(page);
    setActivePageType(null);
    setOutput("");
    setSaveHistoryStatus("idle");
    setSaveHistoryError(null);
    const payload: FranchiseGeneratePayload = { brand_id: brandId, plan_page_id: page.id };
    generate("/api/franchise/generate", payload);
    // Scroll to generation card
    setTimeout(() => {
      document.getElementById("franchise-generate-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }
```

Replace with:
```typescript
  // ---------------------------------------------------------------------------
  // Generate from plan page
  // ---------------------------------------------------------------------------
  function handleGenerateFromPlan(page: PlanPage, popBoost: boolean) {
    setActivePlanPage(page);
    setPopBoostActive(popBoost);
    setActivePageType(null);
    setOutput("");
    setSaveHistoryStatus("idle");
    setSaveHistoryError(null);
    const payload: FranchiseGeneratePayload = {
      brand_id: brandId,
      plan_page_id: page.id,
      ...(popBoost ? { pop_boost: true } : {}),
    };
    generate("/api/franchise/generate", payload);
    // Scroll to generation card
    setTimeout(() => {
      document.getElementById("franchise-generate-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }
```

- [ ] **Step 7: Update the generation card banner + add pre-stream status line**

Find the plan-page mode banner in the generation card:
```typescript
          {/* Plan-page mode: show banner instead of buttons */}
          {activePlanPage ? (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 text-[13px] text-ink-70 bg-[#F3F1ED] rounded-[10px] px-4 py-2.5">
                Generating from plan:{" "}
                <span className="font-medium text-ink">{activePlanPage.title}</span>
              </div>
```

Replace just the inner `<div>` text portion (the flex-1 div):
```typescript
          {/* Plan-page mode: show banner instead of buttons */}
          {activePlanPage ? (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 text-[13px] text-ink-70 bg-[#F3F1ED] rounded-[10px] px-4 py-2.5">
                Generating from plan:{" "}
                <span className="font-medium text-ink">{activePlanPage.title}</span>
                {popBoostActive && (
                  <span className="text-ink-40"> + POP boost</span>
                )}
              </div>
```

- [ ] **Step 8: Add the pre-stream status line**

Find the existing spinner in plan-page mode (currently below the banner div):
```typescript
          {/* Generating spinner for plan-page mode */}
          {activePlanPage && isGenerating && (
            <div className="text-[12px] text-ink-40 flex items-center gap-2">
              <span className="inline-block w-[5px] h-[5px] rounded-full bg-ink-40 animate-pulse" />
              Writing
              <span className="inline-block animate-[ellipsis_1.5s_steps(4,end)_infinite] w-[1.5em] text-left">
                ...
              </span>
            </div>
          )}
```

Replace with:
```typescript
          {/* Generating spinner / pre-stream status for plan-page mode */}
          {activePlanPage && isGenerating && (
            <div className="text-[12px] text-ink-40 flex items-center gap-2">
              <span className="inline-block w-[5px] h-[5px] rounded-full bg-ink-40 animate-pulse" />
              {!output ? (
                "Researching competitors before writing..."
              ) : (
                <>
                  Writing
                  <span className="inline-block animate-[ellipsis_1.5s_steps(4,end)_infinite] w-[1.5em] text-left">
                    ...
                  </span>
                </>
              )}
            </div>
          )}
```

- [ ] **Step 9: Update the `ContentPlanSection` usage site in `FranchisePageInner`**

Find:
```typescript
        <ContentPlanSection
          brandId={brandId}
          hasFactSheet={hasSheet}
          onGenerateFromPlan={handleGenerateFromPlan}
          planPageUpdate={planPageUpdate}
          onPlanPageUpdateApplied={() => setPlanPageUpdate(null)}
        />
```

This already passes `handleGenerateFromPlan` by reference — no change needed here since the updated function signature matches `(page: PlanPage, popBoost: boolean) => void`.

Verify the TypeScript compiler sees the type correctly by proceeding to Task 7.

---

## Task 7: Verify

- [ ] **Step 1: Backend compile + import**

```bash
cd /Users/brandym/projects/pulp/backend
python3 -m py_compile app/services/franchise.py app/routers/franchise.py && \
PULP_DEV=1 SUPABASE_URL=http://x SUPABASE_ANON_KEY=x ANTHROPIC_API_KEY=x POP_API_KEY=x \
  python3 -c "import main; print('BACKEND OK')"
```

Expected: `BACKEND OK`

- [ ] **Step 2: Frontend type check**

```bash
cd /Users/brandym/projects/pulp/frontend
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors (empty output or clean exit).

- [ ] **Step 3: Frontend build**

```bash
cd /Users/brandym/projects/pulp/frontend
npx next build 2>&1 | tail -20
```

Expected: build completes without errors.

---

## Task 8: Commit

- [ ] **Step 1: Stage and commit**

```bash
cd /Users/brandym/projects/pulp
git add backend/app/services/franchise.py backend/app/routers/franchise.py \
        frontend/src/lib/types.ts frontend/src/app/\(app\)/frandev/page.tsx
git status
```

Verify only those four files are staged.

```bash
git commit -m "$(cat <<'EOF'
Ground plan-driven generation in competitor content; optional POP term boost

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task that covers it |
|-----------------|---------------------|
| `gather_competitor_context` — SERP + scrape + directory skip + excerpt + header | Task 1 |
| Any failure returns None, never raises | Task 1 (try/except wrapping all external calls) |
| `render_pop_term_guidance` — top 25 by weight, range formula, target=0 case, word count, footer | Task 2 |
| `build_franchise_user_prompt_from_plan` extended signature; competitor after outline before FACT_DISCIPLINE; pop after keywords | Task 3 |
| `FranchiseGenerateRequest.pop_boost: bool = False` | Task 4 Step 2 |
| Router plan-path: extract top_keyword, call gather_competitor_context always, POP only if pop_boost, pass both into prompt builder | Task 4 Step 3 |
| POP failure must never block generation | Task 4 Step 3 (try/except, log warning, pop_guidance=None) |
| Non-plan path unchanged | Task 4 Step 3 (only modifies the `if req.plan_page_id is not None` branch) |
| `FranchiseGeneratePayload.pop_boost?: boolean` | Task 5 |
| Per-row POP boost checkbox with label + hint | Task 6 Step 4 |
| Wire pop_boost into generate payload | Task 6 Step 6 |
| Banner "+ POP boost" suffix | Task 6 Step 7 |
| Pre-stream "Researching competitors..." status | Task 6 Step 8 |
| py_compile check | Task 7 Step 1 |
| tsc --noEmit | Task 7 Step 2 |
| next build | Task 7 Step 3 |

**Placeholder scan:** No TBD/TODO. All code blocks are complete.

**Type consistency check:**

- `gather_competitor_context(keyword: str, max_pages: int = 3) -> str | None` — matches usage in router (`competitor_context: str | None = None`, call site assigns return directly).
- `render_pop_term_guidance(brief: dict) -> str | None` — matches usage in router (assigned to `pop_guidance: str | None = None`).
- `build_franchise_user_prompt_from_plan(..., competitor_context: str | None = None, pop_guidance: str | None = None) -> str` — matches both call sites (router with kwargs, test with positional).
- `onGenerateFromPlan: (page: PlanPage, popBoost: boolean) => void` — updated in interface, implementation, and call sites.
- `FranchiseGeneratePayload.pop_boost?: boolean` — used as `pop_boost: true` (boolean literal, narrowed by `...(popBoost ? { pop_boost: true } : {})`).
