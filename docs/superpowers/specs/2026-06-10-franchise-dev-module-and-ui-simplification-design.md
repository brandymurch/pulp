# Franchise Development Module + Internal-Tool UI Simplification

**Date:** 2026-06-10
**Status:** Approved direction (Approach A + separate franchise module)

## Context

Pulp is now an internal tool. Two changes: (1) simplify the UI for internal daily use, and (2) add a separate module that generates franchise development page content — pages that recruit franchisees for the brand itself (not consumer/local SEO pages). First two page types: "Why Franchise With [Brand]" and "Investment & Fees".

Decisions made during brainstorming:
- Source facts come from **scraping the brand's existing franchise development site** (Firecrawl service already exists), stored as an editable fact sheet on the brand.
- **Light SEO, no POP**: proper title/meta/heading structure, but no POP brief, term targets, or scoring. The module works independently of the POP billing issue.
- Content is brand-level; no location involved.

## Part 1: UI Simplification (Approach A — light touch)

1. **Drop the Overview dashboard.** Remove the frontend page and nav entry. The app root and post-sign-in redirect go to `/generate`. The backend `/api/dashboard` endpoint stays (harmless, unused) — removing it is optional cleanup.
2. **Merge Queue + History into one `Pages` screen** (`/pages`). In-progress pipeline jobs render at the top (with the existing approve/poll behavior from Queue), finished generations below (the existing History list + detail view). The `/queue` and `/history` routes are removed; the rail entry is `Pages`.
3. **Slim the Generate form.** Visible by default: brand, location, keyword, Generate button. Everything else (content type, feedback/notes, competitor URLs, page slug) moves into a collapsed "More options" section.
4. **Plainer chrome.** Rail shrinks to: Generate, Pages, Franchise, Locations, Voice. Denser tables, remove decorative flourishes where cheap. No redesign — same components, less of them.

Non-goals: no brand-centric IA restructure, no auth changes, no backend API changes for this part.

## Part 2: Franchise Development Module

### User flow

1. Open **Franchise** (new rail entry) → pick a brand.
2. If the brand has no franchise fact sheet: paste one or more URLs of the brand's existing franchise development pages → **Scrape & extract**. Background job (thread + poll, same pattern as brief/score) scrapes the URLs via the existing Firecrawl service and runs a Claude extraction into a structured fact sheet.
3. Review/edit the fact sheet in a form; save. The sheet persists on the brand, so scraping is one-time — pages can be regenerated anytime without re-scraping. Re-scrape is available and overwrites after confirmation.
4. Pick a **page type** → Generate. Output streams like the existing generate page. Save to history.

### Fact sheet (stored as `brands.franchise_profile` JSONB)

```json
{
  "investment_min": 150000,
  "investment_max": 350000,
  "franchise_fee": 49500,
  "royalty_pct": "6%",
  "ad_fund_pct": "2%",
  "territory_model": "exclusive territories by population",
  "training_support": ["2-week initial training", "ongoing field support"],
  "process_steps": ["Inquiry", "Discovery call", "FDD review", "Discovery day", "Signing", "Launch"],
  "differentiators": ["..."],
  "ideal_candidate": "...",
  "proof_points": ["unit count", "awards", "year founded"],
  "source_urls": ["https://..."],
  "scraped_at": "2026-06-10T00:00:00Z"
}
```

All fields optional — extraction fills what it finds; the editor shows empty fields for manual completion. Extraction uses structured outputs (json_schema) on the current Sonnet model.

### Page types (registry)

A dict in the backend, one entry per page type: key, display name, and a prompt block describing the page's job, structure, and audience. Launch set:

- `franchise_why` — "Why Franchise With [Brand]": the persuasion page — differentiators, proof points, support, ideal candidate, call to action.
- `franchise_investment` — "Investment & Fees": transparent breakdown of investment range, fees, royalties, what's included, financing notes, process CTA.

Adding a page type later = one registry entry + nothing else.

### Generation

- Reuses the existing brand-voice system prompt assembly (voice prose, guidelines, banned words, anti-slop rules, cached prefix) with a franchise task block appended.
- **Fact discipline rule in the prompt:** use ONLY facts from the fact sheet; never invent numbers; if a needed fact is missing, write around it or insert `[CONFIRM: ...]` for the team to fill in.
- Light SEO instruction: one H1, descriptive H2s, suggested title tag + meta description at the top of the output, natural use of terms like "franchise opportunity" — explicitly no keyword-count targets.
- Audience instruction: prospective franchisee evaluating an investment — confident, concrete, zero consumer-marketing fluff.
- Streams over the existing SSE contract (`chunk` / `done` / `error`), consumed by the existing `useGeneration`-style reader.

### Backend surface (new `routers/franchise.py` + `services/franchise.py`)

- `POST /api/franchise/scrape` `{brand_id, urls[]}` → `{job_id}` (thread + poll; per-URL scrape failures reported in the result, extraction proceeds on whatever scraped)
- `GET /api/franchise/scrape/status/{job_id}` → pending | error | done + extracted fact sheet (not yet saved)
- `PUT /api/franchise/profile/{brand_id}` → save edited fact sheet to `brands.franchise_profile`
- `GET /api/franchise/profile/{brand_id}` → current fact sheet
- `POST /api/franchise/generate` `{brand_id, page_type}` → SSE stream
- Saving uses the existing `POST /api/generations` with `content_type` set to the page-type key and no location.

### Data model changes (migration + schema file)

- `ALTER TABLE brands ADD COLUMN franchise_profile JSONB` (nullable).
- Verify `generations.location_id` is nullable and a `content_type` (or equivalent) column exists; relax/add via migration if not. History UI labels franchise rows by page-type display name instead of city.

### Error handling

- Scrape job: per-URL errors collected, surfaced in the review step ("2 of 3 pages scraped; example.com/fees failed: 404"). Zero successful scrapes → job error with reason.
- Extraction returns partial sheets freely; the editor is the safety net.
- Generation reuses the hardened SSE error path (truncated output → error event, not a fake done).

### Verification

- `python3 -m py_compile` on touched backend files; `npx next build` green.
- Manual end-to-end: scrape a real brand franchise site, edit the sheet, generate both page types, save, confirm they appear on the Pages screen.
- No new test infrastructure (repo has none); extraction schema keeps parsing risk low.

## Out of scope

- Territory/market-level franchise pages, outreach collateral (emails, one-pagers) — future page types.
- POP integration for franchise pages.
- Brand-centric IA restructure (Approach B).
- Auth changes.
