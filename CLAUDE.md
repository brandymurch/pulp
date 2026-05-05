# Pulp

Content generation tool for multi-location brands. A user enters a keyword for a location, the backend pulls a brief from Page Optimizer Pro (POP), Claude generates the page (streamed), and the user can revise, score against POP, save, or export to Google Drive.

## Layout

- `frontend/` — Next.js 15 App Router, React 19, TypeScript, Tailwind. Authed pages live under the `(app)` route group.
- `backend/` — FastAPI service. Routers in `backend/app/routers/` (auth, brief, score, generate, brands, locations, style_examples, generations, scrape, serp, notion_templates, export, pipeline, dashboard).
- `supabase-schema.sql` — DB schema. Tables: `brands`, `locations`, `style_examples`, `drafts`, `generations`. RLS is permissive (`allow_all`) — app-level JWT is the real auth boundary.
- `render.yaml` — two services: `pulp-api` (Docker, port 8001) and `pulp-web` (Node, port 3000). Hosted on Render in Oregon.

## Run

Frontend:
```
cd frontend && npm install && npm run dev          # :3000
npm run build                                       # NOT vite — use next build
```

Backend:
```
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001               # :8001
```

No test suite. Lint via `next lint`. Frontend type-check: `npx tsc --noEmit` in `frontend/`.

## Architecture

**No Next.js API routes.** Frontend hits the FastAPI backend directly. `frontend/src/lib/api.ts` exports `apiFetch()` — wrapper that injects the JWT from `localStorage` and redirects to sign-in on 401. `NEXT_PUBLIC_API_URL` (default `http://localhost:8001`) controls the target.

**Auth.** Single shared password. `POST /api/auth/login` returns a JWT (7-day expiry). Frontend stores it in `localStorage`, sends `Authorization: Bearer …`. The `require_auth` FastAPI dependency gates protected routers.

**Streaming.** Generation uses SSE. Backend `generate_content()` yields newline-delimited JSON: `{type: "chunk", text}`, `{type: "done", content, usage}`, `{type: "error"}`. Frontend `useGeneration()` reads the stream via `response.body.getReader()` — no library — and supports abort.

**Component layout.**
- `components/shell/` — chrome (Topbar, Rail, UserChip).
- `components/shared/` — primitives (Button, Input, Pill, Icons, PulpLogo).
- `components/voice/` — brand voice tuner + style examples.

All components use **named exports** (`export function Foo`). No barrel files. Don't switch to `export default` — barrel patterns elsewhere depend on named exports.

## Conventions / gotchas

- **Frontend build is `next build`**, not `vite build`. Build dir is `frontend/`.
- **Python is 3.9-compatible** in places — use `from __future__ import annotations` if you need `list | None`.
- **Google Drive export** uses a service account. Files must land in a Shared Drive folder, not My Drive — service-account-owned files in My Drive trigger `storageQuotaExceeded`.
- **Supabase RLS is open by design.** Don't rely on it for authorization; the JWT layer in FastAPI is what protects data.
- **Next.js 16 route handler params are `Promise<{}>`** — await them.
- Frontend env: `NEXT_PUBLIC_API_URL`. Backend env (required): `POP_API_KEY`, `ANTHROPIC_API_KEY`, `APP_PASSWORD`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Optional: `NOTION_*`, `FIRECRAWL_API_KEY`, `DATAFORSEO_*`, `GOOGLE_*`, `FRONTEND_URL`.

## Domain

- **Brand** — multi-location business. Owns voice (`voice_dimensions`, `voice_notes`, `brand_guidelines`, `brand_banned_words`), services list, competitors, and a landing-page template.
- **Location** — one franchisee/territory under a brand. Has city/state and local context.
- **StyleExample** — reference copy (title + content + optional source URL) tied to a brand. Pulp uses these to match voice.
- **Generation** — saved output for a (location, keyword) pair. Tracks token usage, POP score, revision count.
- **Draft** — staged in-progress work (table exists, lightly used).

Generation flow: brand voice configured → user picks location + keyword → POP returns brief (terms, word-count targets) → Claude generates streamed content → optional revise → POP scores → save to `generations` or export to Drive/Notion.
