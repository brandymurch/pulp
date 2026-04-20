# Pulp App MVP — Design Spec

**Date:** 2026-04-20
**Scope:** Content generation flow for one brand (USA Insulation), one user. Architecture prepared for multi-brand, multi-location expansion.

## Overview

Pulp is a content generation tool for multi-location brands. Today's MVP delivers the core generation pipeline — enter a keyword + city, fetch a POP brief, generate a landing page against it, score, auto-revise, and review — wearing the Pulp design system. The data model and API surface are built to support the full dashboard, locations, copy queue, and multi-brand features without rewiring.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 App Router, React 19, TypeScript, Tailwind CSS |
| Backend | Python FastAPI (existing) |
| Database | Supabase (PostgreSQL) |
| Templates | Notion (queried via Notion SDK, converted to markdown) |
| AI | Claude API (Anthropic SDK) |
| SEO | Page Optimizer Pro API |
| Scraping | Jina Reader API |
| SERP | DataForSEO (PAA questions) |
| Auth | APP_PASSWORD env var + JWT |
| Deployment | Render (Oregon) |

## Data Model (Supabase)

All tables have RLS enabled with open policies (app has its own auth gate).

### brands

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| name | TEXT NOT NULL | "USA Insulation" |
| slug | TEXT UNIQUE | "usa-insulation" |
| default_tone | TEXT | e.g. "professional and authoritative" |
| default_content_type | TEXT | "landing page" |
| services | JSONB | array of service names |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | trigger-maintained |

### locations (prepared, not used today)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| brand_id | UUID FK → brands | |
| name | TEXT | "Columbus" |
| city | TEXT | "Columbus" |
| state | TEXT | "OH" |
| slug | TEXT | "/columbus-oh" |
| status | TEXT | live, draft, stale |
| local_context | JSONB | climate, home types, landmarks, energy costs |
| last_refresh_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

### style_examples

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| brand_id | UUID FK → brands ON DELETE CASCADE | |
| title | TEXT | |
| content | TEXT | sample copy |
| url | TEXT | source URL |
| word_count | INTEGER | |
| created_at | TIMESTAMPTZ | |

### drafts (prepared, not used today)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| location_id | UUID FK → locations | nullable for today |
| brand_id | UUID FK → brands | |
| keyword | TEXT | target keyword |
| placement | TEXT | landing, meta, gbp, ad |
| title | TEXT | |
| content | TEXT | |
| outline | TEXT | pass-1 outline |
| word_count | INTEGER | |
| pop_brief | JSONB | stored POP brief |
| pop_score | JSONB | stored POP score |
| competitor_urls | TEXT[] | scraped URLs |
| revision_count | INTEGER DEFAULT 0 | |
| status | TEXT | pending, approved, rejected |
| created_at | TIMESTAMPTZ | |

### generations

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| brand_id | UUID FK → brands | |
| location_id | UUID FK → locations | nullable |
| keyword | TEXT | |
| city | TEXT | for today's flow (before locations) |
| content | TEXT | |
| outline | TEXT | |
| content_type | TEXT | |
| template_name | TEXT | |
| model | TEXT | "sonnet" |
| word_count | INTEGER | |
| input_tokens | INTEGER | |
| output_tokens | INTEGER | |
| pop_brief | JSONB | |
| pop_score | JSONB | |
| revision_count | INTEGER DEFAULT 0 | |
| created_at | TIMESTAMPTZ | |

## Auth

Simple password gate, same as content-gen:

- `APP_PASSWORD` env var on backend
- `POST /api/auth/login` — accepts `{ password }`, returns `{ token }` (JWT)
- JWT signed with `JWT_SECRET` env var
- All API routes except `/health` and `/api/auth/login` require `Authorization: Bearer <token>`
- Frontend stores token in localStorage
- Sign-in page shows password field only (1 user, no email needed)
- Handoff's sign-in design adapted: left column with password form, right column with testimonial

## API Routes

### Auth
```
POST /api/auth/login              { password } → { token }
```

### Brands
```
GET  /api/brands                  → list
GET  /api/brands/:id              → detail
```

### Style Examples
```
GET  /api/style-examples?brand_id=  → list for brand
POST /api/style-examples           { brand_id, title, content, url }
DELETE /api/style-examples/:id
```

### Templates (Notion)
```
GET  /api/notion/templates?brand=  → query Notion DB
GET  /api/notion/templates/:id     → full template body as markdown
```

### Content Pipeline
```
POST /api/brief                   { keyword, target_url?, location? } → POP brief
POST /api/scrape                  { urls[] } → scraped content
POST /api/serp                    { keyword, location? } → PAA questions
POST /api/generate/outline        { keyword, brief, template, paa, competitors,
                                    style_examples, city, state } → outline
POST /api/generate                { keyword, brief, template, outline,
                                    style_examples, city, state,
                                    competitor_content } → SSE stream
POST /api/score                   { content, keyword, target_url? } → POP score
POST /api/generate/revise         { content, keyword, pop_feedback, brief } → SSE stream
```

### Generations (History)
```
GET    /api/generations?brand_id=  → list with pagination
GET    /api/generations/:id
POST   /api/generations            { save generation }
DELETE /api/generations/:id
```

### Export
```
POST /api/export/gdrive           { title, content, keyword, city, brand_id }
                                  → { doc_url, doc_id }
                                  Creates Google Doc in brand → city folder
```

### Dashboard (prepared, not used today)
```
GET  /api/dashboard/stats          → locations live, drafts in queue, voice match
GET  /api/locations                → list for brand
POST /api/locations                → create
PATCH /api/locations/:id           → update
GET  /api/drafts?status=pending    → copy queue
PATCH /api/drafts/:id              → approve/reject/edit
```

## Frontend Structure

### Routes

```
src/app/
  layout.tsx                     ← fonts, globals, auth check
  sign-in/
    page.tsx                     ← password form (adapted from handoff)
  (app)/
    layout.tsx                   ← app shell: Rail + Topbar
    page.tsx                     ← server redirect (HTTP 307) to /generate today; becomes dashboard later
    generate/
      page.tsx                   ← the generation flow (today's primary UI)
    history/
      page.tsx                   ← past generations
    voice/
      page.tsx                   ← style examples management
    locations/                   ← prepared, not routed today
    queue/                       ← prepared, not routed today
```

### Components

```
components/
  auth/
    SignInForm.tsx
  shell/
    Rail.tsx                     ← nav with Overview/Generate/History/Voice active,
                                   Locations/Queue/Integrations/Settings shown but disabled
    Topbar.tsx                   ← search (disabled today) + action buttons
    UserChip.tsx
  generate/
    KeywordInput.tsx             ← keyword + city/state fields
    TemplateSelector.tsx         ← dropdown querying Notion
    PipelineProgress.tsx         ← shows research step progress
    OutlineReview.tsx            ← pass-1 outline with approve/edit
    ContentViewer.tsx            ← streaming output, editable
    TermHeatmap.tsx              ← highlight POP term hits/misses in content
    POPScoreCard.tsx             ← score breakdown, revise button
    CompetitorInput.tsx          ← optional URLs
  voice/
    StyleExamplesList.tsx
    AddStyleExample.tsx
  history/
    GenerationsList.tsx
    GenerationDetail.tsx
  dashboard/                     ← prepared, not used today
    GreetingBlock.tsx
    StatCard.tsx
    LocationsTable.tsx
    StatusPill.tsx
    CopyQueue.tsx
    QueueRow.tsx
    VoiceFingerprintCard.tsx
    VoiceBar.tsx
  shared/
    Button.tsx                   ← ink/ghost/light variants, sm size
    Input.tsx                    ← pill input with hard-offset focus shadow
    Pill.tsx
```

### App Shell

From the handoff design:

- **Rail (240px):** Brand lockup top, nav links, user chip bottom. Today's active nav items: Generate (active by default), History, Voice. Future items shown but styled as disabled: Overview, Locations, Copy queue, Integrations, Settings.
- **Topbar:** Search input (disabled today), spacer, "Press publish" button (disabled today). Active when copy queue is wired up.
- **Main canvas:** 32px 44px 80px padding, renders the current page.
- **Responsive:** Rail collapses to top band at 900px.

### Generate Page (today's primary UI)

Full-page flow within the app shell:

```
┌─────────────────────────────────────────────┐
│ INPUTS                                       │
│ ┌─────────────┐ ┌───────────┐ ┌───────────┐ │
│ │ Keyword     │ │ City, ST  │ │ Template ▾│ │
│ └─────────────┘ └───────────┘ └───────────┘ │
│ ┌─────────────────────────────────────────┐  │
│ │ Competitor URLs (optional)              │  │
│ └─────────────────────────────────────────┘  │
│                          [ Generate → ]      │
├─────────────────────────────────────────────┤
│ PIPELINE PROGRESS                            │
│ ● Brief fetched  ● Competitors scraped       │
│ ● PAA loaded     ● Template ready            │
│ ○ Generating outline...                      │
├─────────────────────────────────────────────┤
│ OUTLINE REVIEW                               │
│ H1: ...                                      │
│ H2: ... / H2: ... / H2: ...                 │
│              [ Approve outline → ] [ Edit ]  │
├─────────────────────────────────────────────┤
│ CONTENT                          POP SCORE   │
│ ┌──────────────────────┐  ┌──────────────┐  │
│ │ Streaming content... │  │ Score: 82    │  │
│ │ (term heatmap after) │  │ Terms: 78    │  │
│ │                      │  │ Words: 89    │  │
│ │                      │  │ Missing: ... │  │
│ │                      │  │ [Revise →]   │  │
│ └──────────────────────┘  └──────────────┘  │
│  [ Save to history ] [ Copy ] [ Export to Drive → ] │
└─────────────────────────────────────────────┘
```

## Generation Pipeline

### Flow

```
1. INPUTS
   User enters: keyword, city, state
   User selects: template (from Notion)
   Optional: competitor URLs

2. RESEARCH (parallel — all 5 fire at once)
   ├── POST /api/brief         → POP brief (term targets, word count)
   ├── POST /api/scrape        → competitor pages + existing page if URL provided
   ├── POST /api/serp          → PAA questions for keyword
   ├── GET  /api/style-examples → brand voice samples
   └── GET  /api/notion/templates/:id → full template as markdown

3. OUTLINE (pass 1)
   POST /api/generate/outline
   Claude receives: template structure + POP brief + PAA + competitor gaps
   Returns: H1, H2s, key points per section, suggested internal links
   User reviews: approve or edit

4. FULL CONTENT (pass 2, SSE)
   POST /api/generate
   Claude receives: approved outline + all research context + style examples
   Streams to frontend in real time

5. SCORE
   POST /api/score
   POP scores the generated content
   Stored alongside the generation

6. AUTO-REVISE (if score < 75, max 2 rounds)
   POST /api/generate/revise
   Claude receives: content + POP feedback (missing terms, word count gap)
   Re-scores after each revision
   Stops when score >= 75 or 2 revisions done

7. REVIEW
   Final content displayed with:
   - Term heatmap (green hits, red misses inline)
   - POP score card
   - Save to history / Copy / Manual edit / Export to Google Drive

8. EXPORT (Google Drive)
   POST /api/export/gdrive
   Creates a Google Doc from the final content
   Organized in Drive: brand folder → city subfolder → doc
   Returns: Google Doc URL for sharing
```

### Claude Prompt Assembly (priority order)

1. **Template** (from Notion) — page skeleton, section structure
2. **POP brief** — term targets and word count
3. **Approved outline** — H1/H2 structure from pass 1
4. **Style examples** — 2-3 brand voice samples
5. **Location context** — city, state (today); local_context JSONB (when locations table is used)
6. **Competitor analysis** — what's ranking, content gaps
7. **PAA questions** — heading candidates

### Revision Prompt

When auto-revising, Claude receives:
- The current content
- POP score feedback: missing terms with target counts, word count gap
- Instruction: "Incorporate the missing terms naturally. Do not change the overall structure or voice. Target the specified word count."

## SSE Streaming Protocol

`POST /api/generate` and `POST /api/generate/revise` return Server-Sent Events. Since `EventSource` only supports GET, the frontend uses `fetch()` + `getReader()` (same pattern as content-gen's `useGeneration` hook).

### Event format
```
event: chunk
data: {"text": "partial content..."}

event: done
data: {"content": "full content", "word_count": 1423, "input_tokens": 8200, "output_tokens": 3100}

event: error
data: {"message": "Claude API error: rate limited"}
```

### Frontend handling
- `fetch(url, { method: 'POST', body, signal })` with `AbortController` for cancel
- Read via `response.body.getReader()` + `TextDecoder`
- Parse SSE lines: split on `\n\n`, extract `event:` and `data:` fields
- On `chunk`: append to content state, render progressively
- On `done`: finalize content, enable score/save/export actions
- On `error`: show error toast, keep any partial content
- On network interruption: keep partial content, show reconnect option

## Outline Output Format

`POST /api/generate/outline` returns JSON (not SSE — outlines are small):

```json
{
  "h1": "Insulation Services in Columbus, OH",
  "sections": [
    {
      "h2": "Why Columbus Homes Need Proper Insulation",
      "key_points": ["Climate zones", "Energy cost savings", "Common home types"],
      "suggested_terms": ["spray foam insulation", "energy efficiency"]
    },
    {
      "h2": "Our Insulation Services",
      "key_points": ["Spray foam", "Blown-in", "Injection foam"],
      "suggested_terms": ["insulation contractor", "home insulation"]
    }
  ],
  "internal_links": [
    {"text": "Cincinnati insulation services", "href": "/cincinnati-oh"}
  ],
  "estimated_word_count": 1500
}
```

The `OutlineReview` component renders this as an editable structured view. User can reorder sections, edit H2s, add/remove key points before approving.

## Pipeline Error Handling

Research steps (step 2) have different criticality:

| Step | Required? | On failure |
|------|-----------|------------|
| POP brief | **Required** | Abort pipeline, show error |
| Style examples | **Required** | Abort — no voice guardrails |
| Notion template | **Required** | Abort — no page structure |
| Competitor scrape | Optional | Continue without competitor context |
| SERP/PAA | Optional | Continue without PAA headings |

`PipelineProgress` shows per-step status: pending, loading, done, failed, skipped. Failed optional steps show a warning icon but don't block generation.

## Revision Storage

Revisions overwrite the `content` field on the `generations` row in place. `revision_count` tracks how many passes occurred. The outline is preserved in the `outline` field for reference. Previous content versions are not stored — the POP score improvement (before vs. after) is the meaningful signal, not the intermediate text.

## Migration Notes

The existing backend (`main.py`) has three endpoints that will be **replaced** by the new versions:

| Existing endpoint | Change |
|-------------------|--------|
| `POST /api/brief` | Keep, compatible. Add optional `city`/`state` params for POP location targeting |
| `POST /api/generate` | Replace. New version accepts outline + full context, returns SSE instead of JSON |
| `POST /api/score` | Keep, compatible. No changes needed |

New endpoints added: `/api/auth/login`, `/api/generate/outline`, `/api/generate/revise`, `/api/scrape`, `/api/serp`, `/api/notion/templates`, `/api/brands`, `/api/style-examples`, `/api/generations`, `/api/export/gdrive`.

The existing `GenerateRequest`/`GenerateResponse` Pydantic models will be replaced with new models matching the expanded input/output contracts.

## Google Drive Export Details

- **Service account** creates docs inside a shared folder (no domain-wide delegation needed)
- **Folder structure**: auto-created on first export per city
  - `GOOGLE_DRIVE_FOLDER_ID` (root) → `USA Insulation/` (brand) → `Columbus OH/` (city) → docs
  - Backend checks if folders exist before creating; caches folder IDs in memory
- **Doc naming**: `"{keyword} - {city} - {date}"` (e.g. "Insulation Services - Columbus OH - 2026-04-20")
- **Doc format**: Content converted from markdown to Google Docs API format (headings, bold, lists)
- **Response**: Returns the Google Doc URL so user can open/share immediately
- **Permissions**: Docs inherit sharing from the parent folder — share the root folder with your team/clients

## Auth Details

- **JWT expiry**: 7 days
- **Frontend 401 handling**: On any API response with status 401, clear localStorage token and redirect to `/sign-in`
- **CORS**: Tighten `allow_origins` to `[FRONTEND_URL]` env var (no more `*`)

## Environment Variables

### Backend
```
APP_PASSWORD=              # login password
JWT_SECRET=                # JWT signing
ANTHROPIC_API_KEY=         # Claude
SUPABASE_URL=              # Supabase project URL
SUPABASE_ANON_KEY=         # Supabase anon key
POP_API_KEY=               # Page Optimizer Pro
NOTION_API_KEY=            # Notion integration token
NOTION_DATABASE_ID=        # Notion templates database
JINA_API_KEY=              # Jina Reader (optional, higher rate limits)
DATAFORSEO_LOGIN=          # DataForSEO (optional)
DATAFORSEO_PASSWORD=       # DataForSEO (optional)
GOOGLE_SERVICE_ACCOUNT_KEY=  # JSON key for Google Drive/Docs API
GOOGLE_DRIVE_FOLDER_ID=    # root folder for exports
```

### Frontend
```
NEXT_PUBLIC_API_URL=       # backend URL
```

## Design System

Carried over from the landing page + handoff. No changes to tokens:

- **Colors:** ink `#141210`, ink-70 `#4A4642`, ink-40 `#9A958E`, ink-20 `#D7D3CD`, line `#E8E5E0`, line-soft `#F3F1ED`, paper `#FFFFFF`, green `#1F7A3A`, amber `#B5730F`, pulp `#FF6A1A` (logo only)
- **Typography:** Fraunces (display/headings), JetBrains Mono (body/UI)
- **Borders:** 1.5px solid ink throughout
- **Shadows:** hard-offset only (4px buttons, 6px cards) — no blur
- **Radii:** pills 999px, cards 16-18px, nav 10px
- **Interactions:** translate + shadow-grow on hover, 0.15-0.2s transitions

## What's Built Today vs. Prepared

| Feature | Today | Prepared |
|---------|-------|----------|
| Sign in (password gate) | Active | Swap for Supabase Auth later |
| App shell (rail + topbar) | Active | All nav items visible |
| Generate page | Active | Primary UI |
| History page | Active | Save/view past generations |
| Voice page | Active | Manage style examples |
| POP brief + score | Active | Existing backend |
| Scraper + SERP | Active | Port from content-gen |
| Notion templates | Active | Port from content-gen |
| Outline checkpoint | Active | New |
| Auto-revise | Active | New |
| Term heatmap | Active | New |
| Google Drive export | Active | New — creates Docs in brand/city folders |
| Dashboard/Overview | Disabled nav item | Full handoff design ready |
| Locations management | DB table exists | UI + API ready to build |
| Copy queue | DB table exists | UI + API ready to build |
| Multi-brand | DB supports it | UI selector + RLS scoping |
| Batch generation | Not started | Same pattern as content-gen |
| Integrations/CMS push | Not started | Settings page + webhooks |

## Porting from content-gen

Code to adapt from `/Users/brandym/content-gen`:

| Module | Source (content-gen) | Target (Pulp) | Adaptation |
|--------|---------------------|---------------|------------|
| Supabase client | `backend/src/services/supabaseClient.js` | Python `supabase` package | JS → Python |
| Auth middleware | `backend/src/middleware/auth.js` | FastAPI dependency | JS → Python |
| Scraper | `backend/src/services/scraper.js` | FastAPI route + httpx | JS → Python, keep cache pattern |
| SERP client | `backend/src/services/serpClient.js` | FastAPI route + httpx | JS → Python |
| Notion client | `backend/src/services/notionClient.js` | FastAPI route + notion-client | JS → Python |
| Content generator | `backend/src/services/contentGenerator.js` | Extend existing Pulp generator | Prompt patterns, revision mode |
| Claude client | `backend/src/services/claudeClient.js` | Existing Pulp anthropic usage | SSE streaming pattern |
| useGeneration hook | `frontend/src/hooks/useGeneration.js` | TypeScript hook | JSX → TSX, same SSE pattern |
| useAuth hook | `frontend/src/hooks/useAuth.js` | TypeScript hook | JSX → TSX |
