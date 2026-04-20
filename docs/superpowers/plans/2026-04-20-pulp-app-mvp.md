# Pulp App MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Pulp content generation flow — sign in, select template, enter keyword + city, run POP-guided pipeline, review/score/revise, export to Google Drive — for USA Insulation.

**Architecture:** Python FastAPI backend extended with Supabase, Notion, Jina Reader, DataForSEO, and Google Drive integrations. Next.js 15 frontend with app shell (rail + topbar) and generate page as the primary UI. SSE streaming for content generation.

**Tech Stack:** FastAPI, Supabase (supabase-py), Anthropic SDK, httpx, PyJWT, notion-client, google-api-python-client, Next.js 15, React 19, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-20-pulp-app-mvp-design.md`
**Design handoff:** `/tmp/pulp-handoff/design_handoff_pulp_dashboard/`
**Reference codebase:** `/Users/brandym/content-gen/` (Node/Express — patterns ported to Python)

---

## File Structure

### Backend (`backend/`)

The current single-file `main.py` will be split into a proper package:

```
backend/
  main.py                          # FastAPI app entry, CORS, router mounting
  requirements.txt                 # Updated with new deps
  Dockerfile                       # Updated to copy full package
  app/
    __init__.py
    config.py                      # All env vars, constants
    auth.py                        # JWT sign/verify, FastAPI dependency
    models.py                      # Pydantic request/response models
    db.py                          # Supabase client singleton
    routers/
      __init__.py
      auth.py                      # POST /api/auth/login
      brands.py                    # GET /api/brands
      style_examples.py            # CRUD /api/style-examples
      notion_templates.py          # GET /api/notion/templates
      brief.py                     # POST /api/brief (existing POP logic)
      scrape.py                    # POST /api/scrape
      serp.py                      # POST /api/serp
      generate.py                  # POST /api/generate, /outline, /revise (SSE)
      score.py                     # POST /api/score (existing POP scoring)
      generations.py               # CRUD /api/generations
      export.py                    # POST /api/export/gdrive
    services/
      __init__.py
      pop.py                       # POP API integration (extracted from main.py)
      claude.py                    # Claude streaming client
      scraper.py                   # Jina Reader + BeautifulSoup fallback + cache
      serp.py                      # DataForSEO PAA client
      notion.py                    # Notion SDK template fetching + markdown
      content_generator.py         # Prompt assembly, outline, revision
      gdrive.py                    # Google Drive/Docs export
```

### Frontend (`frontend/`)

```
frontend/
  src/
    app/
      layout.tsx                   # Existing — add auth provider wrapper
      page.tsx                     # Existing landing page (unchanged)
      sign-in/
        page.tsx                   # Sign-in screen
      (app)/
        layout.tsx                 # App shell: Rail + Topbar
        page.tsx                   # Redirect to /generate
        generate/
          page.tsx                 # Generation flow
        history/
          page.tsx                 # Past generations
        voice/
          page.tsx                 # Style examples management
    components/
      auth/
        SignInForm.tsx
      shell/
        Rail.tsx
        Topbar.tsx
        UserChip.tsx
      generate/
        KeywordInput.tsx
        TemplateSelector.tsx
        PipelineProgress.tsx
        OutlineReview.tsx
        ContentViewer.tsx
        TermHeatmap.tsx
        POPScoreCard.tsx
      voice/
        StyleExamplesList.tsx
        AddStyleExample.tsx
      history/
        GenerationsList.tsx
      shared/
        Button.tsx
        Input.tsx
    hooks/
      useAuth.ts
      useGeneration.ts
    lib/
      api.ts                       # fetch wrapper with auth token
```

---

## Task 1: Backend restructure + config + dependencies

Split monolithic `main.py` into a package. No new features — just reorganize.

**Files:**
- Create: `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/models.py`, `backend/app/db.py`, `backend/app/auth.py`
- Create: `backend/app/routers/__init__.py`, `backend/app/routers/brief.py`, `backend/app/routers/generate.py`, `backend/app/routers/score.py`
- Create: `backend/app/services/__init__.py`, `backend/app/services/pop.py`, `backend/app/services/claude.py`
- Modify: `backend/main.py` — slim down to app creation + router mounting
- Modify: `backend/requirements.txt` — add new dependencies
- Modify: `backend/Dockerfile` — copy full package

- [ ] **Step 1: Update requirements.txt**

```
fastapi>=0.109.0
uvicorn>=0.27.0
httpx>=0.26.0
anthropic>=0.18.0
pydantic>=2.5.0
supabase>=2.0.0
PyJWT>=2.8.0
python-dotenv>=1.0.0
beautifulsoup4>=4.12.0
google-api-python-client>=2.100.0
google-auth>=2.25.0
notion-client>=2.2.0
```

- [ ] **Step 2: Create `backend/app/__init__.py`**

Empty file.

- [ ] **Step 3: Create `backend/app/config.py`**

```python
"""Centralized configuration from environment variables."""
from __future__ import annotations
import os

# Auth
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "pulp-dev-secret")
JWT_EXPIRY_DAYS = 7

# Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

# Anthropic
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# POP
POP_API_KEY = os.environ.get("POP_API_KEY", "")
POP_EXPOSE_URL = "https://app.pageoptimizer.pro/api/expose"
POP_TASK_URL = "https://app.pageoptimizer.pro/api/task"

# Notion
NOTION_API_KEY = os.environ.get("NOTION_API_KEY", "")
NOTION_DATABASE_ID = os.environ.get("NOTION_DATABASE_ID", "")

# Jina Reader
JINA_API_KEY = os.environ.get("JINA_API_KEY", "")

# DataForSEO
DATAFORSEO_LOGIN = os.environ.get("DATAFORSEO_LOGIN", "")
DATAFORSEO_PASSWORD = os.environ.get("DATAFORSEO_PASSWORD", "")

# Google Drive
GOOGLE_SERVICE_ACCOUNT_KEY = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY", "")
GOOGLE_DRIVE_FOLDER_ID = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")

# Frontend
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
```

- [ ] **Step 4: Create `backend/app/db.py`**

```python
"""Supabase client singleton."""
from __future__ import annotations
import logging
from supabase import create_client, Client
from app.config import SUPABASE_URL, SUPABASE_ANON_KEY

logger = logging.getLogger(__name__)

_client: Client | None = None

def get_db() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            logger.warning("SUPABASE_URL or SUPABASE_ANON_KEY not set")
            raise RuntimeError("Supabase not configured")
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return _client
```

- [ ] **Step 5: Create `backend/app/auth.py`**

```python
"""JWT authentication — password gate."""
from __future__ import annotations
import datetime
import jwt
from fastapi import Depends, HTTPException, Request
from app.config import APP_PASSWORD, JWT_SECRET, JWT_EXPIRY_DAYS

def create_token() -> str:
    payload = {
        "authenticated": True,
        "exp": datetime.datetime.now(datetime.timezone.utc)
        + datetime.timedelta(days=JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def verify_password(password: str) -> bool:
    return password == APP_PASSWORD

def require_auth(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth_header[7:]
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

- [ ] **Step 6: Create `backend/app/models.py`**

```python
"""Pydantic request/response models."""
from __future__ import annotations
from typing import Any
from pydantic import BaseModel

# Auth
class LoginRequest(BaseModel):
    password: str

class LoginResponse(BaseModel):
    token: str

# Brief (existing)
class BriefRequest(BaseModel):
    keyword: str
    target_url: str | None = None
    location: str | None = None

class BriefResponse(BaseModel):
    target_word_count: int
    term_targets: list[dict[str, Any]]
    lsa_phrases: list[str]

# Generate
class OutlineRequest(BaseModel):
    keyword: str
    city: str
    state: str
    brief: dict[str, Any]
    template: dict[str, Any] | None = None
    paa_questions: list[str] = []
    competitors: list[dict[str, Any]] = []
    style_examples: list[dict[str, Any]] = []

class GenerateRequest(BaseModel):
    keyword: str
    city: str
    state: str
    brief: dict[str, Any]
    outline: dict[str, Any] | None = None
    template: dict[str, Any] | None = None
    style_examples: list[dict[str, Any]] = []
    competitor_content: list[dict[str, Any]] = []

class ReviseRequest(BaseModel):
    content: str
    keyword: str
    brief: dict[str, Any]
    pop_feedback: dict[str, Any]

# Score (existing)
class ScoreRequest(BaseModel):
    content: str
    keyword: str
    target_url: str | None = None

class ScoreResponse(BaseModel):
    overall_score: int
    term_score: int
    word_count_score: int
    recommendations: list[str]
    well_optimized: list[dict[str, Any]]
    missing: list[dict[str, Any]]

# Scrape
class ScrapeRequest(BaseModel):
    urls: list[str]

# SERP
class SerpRequest(BaseModel):
    keyword: str
    location: str | None = None

# Export
class ExportGDriveRequest(BaseModel):
    title: str
    content: str
    keyword: str
    city: str
    brand_id: str

class ExportGDriveResponse(BaseModel):
    doc_url: str
    doc_id: str

# Generations
class SaveGenerationRequest(BaseModel):
    brand_id: str
    keyword: str
    city: str
    content: str
    outline: str | None = None
    content_type: str = "landing_page"
    template_name: str | None = None
    model: str = "sonnet"
    word_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    pop_brief: dict[str, Any] | None = None
    pop_score: dict[str, Any] | None = None
    revision_count: int = 0
```

- [ ] **Step 7: Extract POP logic to `backend/app/services/pop.py`**

Move the POP functions from `main.py` (`_poll_task`, `_get_terms`, `_create_report`, `get_enriched_brief`, `score_content_with_pop`, `stub_score`) into this file. Keep the exact same logic. Import config from `app.config`.

- [ ] **Step 8: Extract Claude logic to `backend/app/services/claude.py`**

Move `_build_system_prompt`, `_build_user_prompt`, `_parse_generated_content`, `generate_content` from `main.py`. These will be extended later in the content_generator service. For now, just extract as-is.

- [ ] **Step 9: Create routers — `auth.py`, `brief.py`, `score.py`, `generate.py`**

`backend/app/routers/auth.py`:
```python
from fastapi import APIRouter
from app.models import LoginRequest, LoginResponse
from app.auth import verify_password, create_token
from fastapi import HTTPException

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    if not verify_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    return LoginResponse(token=create_token())
```

`backend/app/routers/brief.py` — extract `POST /api/brief` from main.py, wire to `services.pop.get_enriched_brief`.

`backend/app/routers/score.py` — extract `POST /api/score` from main.py, wire to `services.pop.score_content_with_pop` / `stub_score`.

`backend/app/routers/generate.py` — extract `POST /api/generate` from main.py, wire to `services.claude.generate_content`. This will be extended in Task 4 to support SSE + outline + revise.

- [ ] **Step 10: Slim down `main.py`**

```python
"""Pulp API entry point."""
from __future__ import annotations
import logging
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import FRONTEND_URL
from app.routers import auth, brief, score, generate

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Pulp API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(brief.router)
app.include_router(score.router)
app.include_router(generate.router)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 11: Update Dockerfile**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
COPY app/ app/
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]
```

- [ ] **Step 12: Verify backend starts locally**

```bash
cd backend && pip install -r requirements.txt && python -m uvicorn main:app --port 8001
```

Hit `http://localhost:8001/health` — expect `{"status":"ok"}`.

- [ ] **Step 13: Commit**

```bash
git add backend/
git commit -m "refactor: split backend into package with config, auth, db, routers, services"
```

---

## Task 2: Supabase schema + seed data

Set up the database tables and seed USA Insulation brand.

**Files:**
- Create: `supabase-schema.sql` (replace existing placeholder if any)

- [ ] **Step 1: Write schema SQL**

```sql
-- Brands
CREATE TABLE brands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  default_tone TEXT DEFAULT 'professional and authoritative',
  default_content_type TEXT DEFAULT 'landing page',
  services JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Locations (prepared for future use)
CREATE TABLE locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  slug TEXT,
  status TEXT DEFAULT 'draft',
  local_context JSONB DEFAULT '{}',
  last_refresh_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_locations_brand_id ON locations(brand_id);

-- Style examples
CREATE TABLE style_examples (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT,
  word_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_style_examples_brand_id ON style_examples(brand_id);

-- Drafts (prepared for future use)
CREATE TABLE drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  placement TEXT DEFAULT 'landing',
  title TEXT,
  content TEXT,
  outline TEXT,
  word_count INTEGER DEFAULT 0,
  pop_brief JSONB,
  pop_score JSONB,
  competitor_urls TEXT[] DEFAULT '{}',
  revision_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_drafts_brand_id ON drafts(brand_id);

-- Generations
CREATE TABLE generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  keyword TEXT NOT NULL,
  city TEXT,
  content TEXT NOT NULL,
  outline TEXT,
  content_type TEXT,
  template_name TEXT,
  model TEXT DEFAULT 'sonnet',
  word_count INTEGER DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  pop_brief JSONB,
  pop_score JSONB,
  revision_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_generations_brand_id ON generations(brand_id);
CREATE INDEX idx_generations_created_at ON generations(created_at DESC);

-- RLS: enabled with open policies (app has own auth)
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON brands FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON style_examples FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON drafts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON generations FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger for brands
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Run schema in Supabase SQL editor**

Go to Supabase dashboard → SQL Editor → paste and run.

- [ ] **Step 3: Seed USA Insulation brand**

Run in Supabase SQL editor:

```sql
INSERT INTO brands (name, slug, default_tone, default_content_type, services)
VALUES (
  'USA Insulation',
  'usa-insulation',
  'professional, knowledgeable, and approachable',
  'landing page',
  '["Injection Foam Insulation", "Spray Foam Insulation", "Blown-In Insulation", "Air Sealing", "Attic Insulation", "Wall Insulation", "Crawl Space Insulation", "Garage Insulation", "Energy Audits"]'
);
```

- [ ] **Step 4: Commit schema**

```bash
git add supabase-schema.sql
git commit -m "feat: Supabase schema — brands, locations, style_examples, drafts, generations"
```

---

## Task 3: Backend service — Supabase CRUD routers

Wire up brands, style examples, and generations CRUD through Supabase.

**Files:**
- Create: `backend/app/routers/brands.py`
- Create: `backend/app/routers/style_examples.py`
- Create: `backend/app/routers/generations.py`
- Modify: `backend/main.py` — mount new routers

- [ ] **Step 1: Create `backend/app/routers/brands.py`**

```python
from fastapi import APIRouter, Depends
from app.auth import require_auth
from app.db import get_db

router = APIRouter(prefix="/api/brands", tags=["brands"])

@router.get("")
async def list_brands(_=Depends(require_auth)):
    db = get_db()
    result = db.table("brands").select("*").execute()
    return result.data

@router.get("/{brand_id}")
async def get_brand(brand_id: str, _=Depends(require_auth)):
    db = get_db()
    result = db.table("brands").select("*").eq("id", brand_id).single().execute()
    return result.data
```

- [ ] **Step 2: Create `backend/app/routers/style_examples.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import require_auth
from app.db import get_db

router = APIRouter(prefix="/api/style-examples", tags=["style-examples"])

@router.get("")
async def list_examples(brand_id: str, _=Depends(require_auth)):
    db = get_db()
    result = db.table("style_examples").select("*").eq("brand_id", brand_id).execute()
    return result.data

class CreateStyleExampleRequest(BaseModel):
    brand_id: str
    title: str
    content: str
    url: str | None = None

@router.post("")
async def create_example(req: CreateStyleExampleRequest, _=Depends(require_auth)):
    db = get_db()
    data = req.model_dump(exclude_none=True)
    data["word_count"] = len(req.content.split())
    result = db.table("style_examples").insert(data).execute()
    return result.data[0]

@router.delete("/{example_id}")
async def delete_example(example_id: str, _=Depends(require_auth)):
    db = get_db()
    db.table("style_examples").delete().eq("id", example_id).execute()
    return {"ok": True}
```

- [ ] **Step 3: Create `backend/app/routers/generations.py`**

```python
from fastapi import APIRouter, Depends
from app.auth import require_auth
from app.db import get_db
from app.models import SaveGenerationRequest

router = APIRouter(prefix="/api/generations", tags=["generations"])

@router.get("")
async def list_generations(brand_id: str, limit: int = 50, offset: int = 0, _=Depends(require_auth)):
    db = get_db()
    result = (
        db.table("generations")
        .select("*")
        .eq("brand_id", brand_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data

@router.get("/{gen_id}")
async def get_generation(gen_id: str, _=Depends(require_auth)):
    db = get_db()
    result = db.table("generations").select("*").eq("id", gen_id).single().execute()
    return result.data

@router.post("")
async def save_generation(req: SaveGenerationRequest, _=Depends(require_auth)):
    db = get_db()
    result = db.table("generations").insert(req.model_dump()).execute()
    return result.data[0]

@router.delete("/{gen_id}")
async def delete_generation(gen_id: str, _=Depends(require_auth)):
    db = get_db()
    db.table("generations").delete().eq("id", gen_id).execute()
    return {"ok": True}
```

- [ ] **Step 4: Mount routers in `main.py`**

Add imports and `app.include_router(...)` for brands, style_examples, generations.

- [ ] **Step 5: Test CRUD locally**

```bash
# Login
curl -X POST http://localhost:8001/api/auth/login -H 'Content-Type: application/json' -d '{"password":"your-password"}'

# List brands (use token from above)
curl http://localhost:8001/api/brands -H 'Authorization: Bearer <token>'
```

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: Supabase CRUD routers — brands, style examples, generations"
```

---

## Task 4: Backend services — scraper, SERP, Notion

Port the three research services from content-gen to Python.

**Files:**
- Create: `backend/app/services/scraper.py`
- Create: `backend/app/services/serp.py`
- Create: `backend/app/services/notion.py`
- Create: `backend/app/routers/scrape.py`
- Create: `backend/app/routers/serp.py`
- Create: `backend/app/routers/notion_templates.py`
- Modify: `backend/main.py` — mount new routers

- [ ] **Step 1: Create `backend/app/services/scraper.py`**

Port from `content-gen/backend/src/services/scraper.js`:
- In-memory cache dict with 30-min TTL, 200-entry max
- `async def scrape_url(url: str) -> dict` — try Jina Reader first (`GET https://r.jina.ai/{url}` with Accept: application/json), fallback to httpx + BeautifulSoup
- Return: `{ url, title, content, word_count, headings, source, from_cache, scrape_quality }`
- `async def scrape_urls(urls: list[str]) -> list[dict]` — parallel with asyncio.gather

Reference: `content-gen/backend/src/services/scraper.js`

- [ ] **Step 2: Create `backend/app/services/serp.py`**

Port from `content-gen/backend/src/services/serpClient.js`:
- `async def get_serp_results(keyword: str, location: str = "United States") -> dict`
- POST to `https://api.dataforseo.com/v3/serp/google/organic/live/advanced`
- Basic auth with DATAFORSEO_LOGIN:DATAFORSEO_PASSWORD
- Parse: organic results, PAA questions, related searches, AI overview queries
- Return: `{ keyword, organic_results, paa_questions, related_searches, ai_fanout_queries }`

Reference: `content-gen/backend/src/services/serpClient.js`

- [ ] **Step 3: Create `backend/app/services/notion.py`**

Port from `content-gen/backend/src/services/notionClient.js`:
- Use `notion-client` Python SDK
- `async def list_templates(brand: str | None = None) -> list[dict]` — query Notion database, return metadata
- `async def get_template(page_id: str) -> dict` — fetch page + convert blocks to markdown
- For markdown conversion: iterate Notion blocks, convert headings/paragraphs/lists to markdown strings (simpler than notion-to-md since Python doesn't have that exact library — use `notion-client` block children API + manual markdown conversion)
- Strip images from content (same regex as content-gen)
- Return: `{ id, name, brand, page_type, seo_title_format, meta_description_format, url_format, content }`

Reference: `content-gen/backend/src/services/notionClient.js`

**Note:** The Python notion-client may use `client.databases.query()` instead of `dataSources.query()`. Check the SDK version and use whichever is available.

- [ ] **Step 4: Create routers for scrape, serp, notion_templates**

Each router: mount at `/api/scrape`, `/api/serp`, `/api/notion/templates`. All require auth. Call the corresponding service.

- [ ] **Step 5: Mount routers in `main.py`**

- [ ] **Step 6: Test each endpoint**

```bash
# Scrape
curl -X POST http://localhost:8001/api/scrape -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"urls":["https://www.usainsulation.com"]}'

# SERP (requires DataForSEO creds)
curl -X POST http://localhost:8001/api/serp -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"keyword":"insulation services columbus ohio"}'

# Notion templates (requires Notion creds)
curl http://localhost:8001/api/notion/templates -H 'Authorization: Bearer <token>'
```

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: research services — Jina scraper, DataForSEO SERP, Notion templates"
```

---

## Task 5: Backend — SSE streaming + outline + revise

Replace the existing JSON generate endpoint with SSE streaming, add outline generation and revision.

**Files:**
- Create: `backend/app/services/content_generator.py`
- Modify: `backend/app/services/claude.py` — add streaming support
- Modify: `backend/app/routers/generate.py` — SSE endpoints

- [ ] **Step 1: Update `backend/app/services/claude.py` for streaming**

```python
"""Claude API client with SSE streaming."""
from __future__ import annotations
import asyncio
import json
import logging
from typing import AsyncGenerator
import anthropic
from app.config import ANTHROPIC_API_KEY

logger = logging.getLogger(__name__)

MODELS = {
    "sonnet": "claude-sonnet-4-20250514",
    "opus": "claude-opus-4-6",
}
STREAM_TIMEOUT = 120  # seconds

async def stream_claude(
    system_prompt: str,
    user_prompt: str,
    model: str = "sonnet",
) -> AsyncGenerator[str, None]:
    """Stream Claude response as SSE events.

    Yields strings in SSE format: 'data: {"type": "chunk", "text": "..."}\n\n'
    Final yield: 'data: {"type": "done", "content": "...", ...}\n\n'
    """
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    model_id = MODELS.get(model, MODELS["sonnet"])
    full_text = ""
    usage = {"input_tokens": 0, "output_tokens": 0}

    try:
        async with client.messages.stream(
            model=model_id,
            max_tokens=12000,
            temperature=0.4,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            async for event in stream:
                if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                    chunk = event.delta.text
                    full_text += chunk
                    yield f'data: {json.dumps({"type": "chunk", "text": chunk})}\n\n'

            msg = await stream.get_final_message()
            if msg and msg.usage:
                usage["input_tokens"] = msg.usage.input_tokens
                usage["output_tokens"] = msg.usage.output_tokens

    except Exception as e:
        logger.error(f"Claude stream error: {e}")
        if full_text:
            # Return partial content
            pass
        else:
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
            return

    # Strip em dashes
    full_text = full_text.replace("\u2014", "-").replace("\u2013", "-")
    word_count = len(full_text.split())

    yield f'data: {json.dumps({"type": "done", "content": full_text, "word_count": word_count, "usage": usage})}\n\n'
```

- [ ] **Step 2: Create `backend/app/services/content_generator.py`**

Port prompt assembly from `content-gen/backend/src/services/contentGenerator.js`:
- `build_system_prompt(template, style_examples, services)` — system prompt with voice, template, and service guardrails
- `build_user_prompt(keyword, city, state, brief, template, competitors, paa, style_examples)` — user prompt with POP brief terms, competitor data, PAA questions
- `build_outline_prompt(keyword, city, state, brief, template, paa, competitors)` — system+user for outline generation (returns JSON)
- `build_revision_prompts(content, keyword, brief, pop_feedback)` — revision system+user prompts
- `resolve_template_placeholders(template_content, keyword, brand_name, city)` — replace `[service]`, `[location]`, `[city]`, etc.

Reference: `content-gen/backend/src/services/contentGenerator.js` for exact prompt text and assembly order.

- [ ] **Step 3: Update `backend/app/routers/generate.py`**

```python
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.auth import require_auth
from app.models import OutlineRequest, GenerateRequest, ReviseRequest
from app.services.claude import stream_claude
from app.services.content_generator import (
    build_system_prompt, build_user_prompt,
    build_outline_prompt, build_revision_prompts,
)
import anthropic
import json
from app.config import ANTHROPIC_API_KEY

router = APIRouter(prefix="/api/generate", tags=["generate"])

@router.post("/outline")
async def generate_outline(req: OutlineRequest, _=Depends(require_auth)):
    """Generate content outline (JSON response, not SSE)."""
    system, user = build_outline_prompt(
        keyword=req.keyword, city=req.city, state=req.state,
        brief=req.brief, template=req.template,
        paa=req.paa_questions, competitors=req.competitors,
    )
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000, temperature=0.3,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    # Parse JSON from response (Claude may wrap in ```json)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(raw)

@router.post("")
async def generate_content(req: GenerateRequest, _=Depends(require_auth)):
    """Generate full content via SSE stream."""
    system = build_system_prompt(
        template=req.template,
        style_examples=req.style_examples,
        services=[],  # loaded from brand if needed
    )
    user = build_user_prompt(
        keyword=req.keyword, city=req.city, state=req.state,
        brief=req.brief, template=req.template, outline=req.outline,
        competitors=req.competitor_content,
        style_examples=req.style_examples,
    )
    return StreamingResponse(
        stream_claude(system, user),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )

@router.post("/revise")
async def revise_content(req: ReviseRequest, _=Depends(require_auth)):
    """Revise content based on POP feedback via SSE stream."""
    system, user = build_revision_prompts(
        content=req.content, keyword=req.keyword,
        brief=req.brief, pop_feedback=req.pop_feedback,
    )
    return StreamingResponse(
        stream_claude(system, user),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
```

- [ ] **Step 4: Test SSE streaming**

```bash
curl -N -X POST http://localhost:8001/api/generate \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"keyword":"insulation services","city":"Columbus","state":"OH","brief":{"target_word_count":1500,"term_targets":[],"lsa_phrases":[]}}'
```

Expect streaming `data: {...}\n\n` events.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: SSE streaming generation + outline + revision endpoints"
```

---

## Task 6: Backend — Google Drive export

**Files:**
- Create: `backend/app/services/gdrive.py`
- Create: `backend/app/routers/export.py`
- Modify: `backend/main.py` — mount export router

- [ ] **Step 1: Create `backend/app/services/gdrive.py`**

```python
"""Google Drive/Docs export service."""
from __future__ import annotations
import json
import logging
import re
from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.config import GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_DRIVE_FOLDER_ID

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/documents",
]

_drive = None
_docs = None
_folder_cache: dict[str, str] = {}  # "brand/city" → folder_id


def _get_services():
    global _drive, _docs
    if _drive is None:
        creds_dict = json.loads(GOOGLE_SERVICE_ACCOUNT_KEY)
        creds = service_account.Credentials.from_service_account_info(
            creds_dict, scopes=SCOPES
        )
        _drive = build("drive", "v3", credentials=creds)
        _docs = build("docs", "v1", credentials=creds)
    return _drive, _docs


def _find_or_create_folder(drive, name: str, parent_id: str) -> str:
    cache_key = f"{parent_id}/{name}"
    if cache_key in _folder_cache:
        return _folder_cache[cache_key]

    # Search for existing
    query = (
        f"name='{name}' and '{parent_id}' in parents "
        f"and mimeType='application/vnd.google-apps.folder' and trashed=false"
    )
    results = drive.files().list(q=query, fields="files(id)").execute()
    files = results.get("files", [])

    if files:
        folder_id = files[0]["id"]
    else:
        meta = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }
        folder = drive.files().create(body=meta, fields="id").execute()
        folder_id = folder["id"]

    _folder_cache[cache_key] = folder_id
    return folder_id


def _markdown_to_docs_requests(markdown: str) -> list[dict]:
    """Convert markdown to Google Docs API batchUpdate requests."""
    requests = []
    index = 1  # Docs index starts at 1

    for line in markdown.split("\n"):
        stripped = line.strip()
        if not stripped:
            text = "\n"
            requests.append({
                "insertText": {"location": {"index": index}, "text": text}
            })
            index += len(text)
            continue

        # Headings
        heading_match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            text = heading_match.group(2) + "\n"
            requests.append({
                "insertText": {"location": {"index": index}, "text": text}
            })
            style_map = {1: "HEADING_1", 2: "HEADING_2", 3: "HEADING_3",
                         4: "HEADING_4", 5: "HEADING_5", 6: "HEADING_6"}
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": index, "endIndex": index + len(text)},
                    "paragraphStyle": {"namedStyleType": style_map.get(level, "HEADING_3")},
                    "fields": "namedStyleType",
                }
            })
            index += len(text)
            continue

        # Regular paragraph
        text = stripped + "\n"
        requests.append({
            "insertText": {"location": {"index": index}, "text": text}
        })
        index += len(text)

    return requests


def export_to_drive(
    title: str, content: str, brand_name: str, city: str
) -> dict[str, str]:
    """Create a Google Doc from markdown content.

    Returns: { doc_url, doc_id }
    """
    drive, docs = _get_services()

    # Create folder hierarchy: root → brand → city
    brand_folder = _find_or_create_folder(drive, brand_name, GOOGLE_DRIVE_FOLDER_ID)
    city_folder = _find_or_create_folder(drive, city, brand_folder)

    # Create empty doc in city folder
    file_meta = {
        "name": title,
        "mimeType": "application/vnd.google-apps.document",
        "parents": [city_folder],
    }
    doc_file = drive.files().create(body=file_meta, fields="id").execute()
    doc_id = doc_file["id"]

    # Populate doc with content
    doc_requests = _markdown_to_docs_requests(content)
    if doc_requests:
        docs.documents().batchUpdate(
            documentId=doc_id, body={"requests": doc_requests}
        ).execute()

    doc_url = f"https://docs.google.com/document/d/{doc_id}/edit"
    return {"doc_url": doc_url, "doc_id": doc_id}
```

- [ ] **Step 2: Create `backend/app/routers/export.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from app.auth import require_auth
from app.db import get_db
from app.models import ExportGDriveRequest, ExportGDriveResponse
from app.services.gdrive import export_to_drive
from app.config import GOOGLE_SERVICE_ACCOUNT_KEY

router = APIRouter(prefix="/api/export", tags=["export"])

@router.post("/gdrive", response_model=ExportGDriveResponse)
async def export_gdrive(req: ExportGDriveRequest, _=Depends(require_auth)):
    if not GOOGLE_SERVICE_ACCOUNT_KEY:
        raise HTTPException(status_code=503, detail="Google Drive not configured")

    db = get_db()
    brand = db.table("brands").select("name").eq("id", req.brand_id).single().execute()
    brand_name = brand.data["name"]

    result = export_to_drive(
        title=req.title,
        content=req.content,
        brand_name=brand_name,
        city=req.city,
    )
    return ExportGDriveResponse(**result)
```

- [ ] **Step 3: Mount in `main.py`, test**

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "feat: Google Drive export — creates Docs in brand/city folder hierarchy"
```

---

## Task 7: Frontend — shared components + design system

Build the reusable UI primitives from the handoff design system.

**Files:**
- Create: `frontend/src/components/shared/Button.tsx`
- Create: `frontend/src/components/shared/Input.tsx`
- Create: `frontend/src/components/shared/Pill.tsx`
- Modify: `frontend/src/app/globals.css` — add missing tokens
- Modify: `frontend/tailwind.config.ts` — add missing colors

- [ ] **Step 1: Update `globals.css` with missing tokens**

Add `--ink-20`, `--line-soft`, `--green`, `--amber` to `:root`.

- [ ] **Step 2: Update `tailwind.config.ts`**

Add `ink-20`, `line-soft`, `green`, `amber` to the colors config.

- [ ] **Step 3: Create `Button.tsx`**

```tsx
"use client";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "ink" | "ghost" | "light";
  size?: "default" | "sm";
  children: React.ReactNode;
}

export function Button({ variant = "ink", size = "default", children, className = "", ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.04em] cursor-pointer border-[1.5px] transition-all duration-150";
  const sizes = {
    default: "h-10 px-[18px] text-xs",
    sm: "h-8 px-3.5 text-[11px]",
  };
  const variants = {
    ink: "bg-ink text-white border-ink hover:-translate-y-px hover:shadow-[4px_4px_0_0_var(--ink)]",
    ghost: "bg-transparent text-ink border-ink hover:bg-ink hover:text-white",
    light: "bg-white text-ink border-line hover:border-ink",
  };

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Create `Input.tsx`**

```tsx
"use client";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">
          {label}
        </label>
      )}
      <input
        className={`w-full h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] font-mono text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] ${className}`}
        {...props}
      />
    </div>
  );
}
```

- [ ] **Step 5: Create `Pill.tsx`**

```tsx
"use client";

interface PillProps {
  variant?: "default" | "live" | "draft" | "stale" | "count";
  children: React.ReactNode;
  className?: string;
}

export function Pill({ variant = "default", children, className = "" }: PillProps) {
  const base = "inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] uppercase px-2.5 py-0.5 rounded-full border-[1.5px] border-ink";
  const variants = {
    default: "bg-white text-ink",
    live: "bg-ink text-white",
    draft: "bg-white text-ink",
    stale: "bg-white text-ink-70",
    count: "bg-white text-ink text-[10px] px-2 py-px",
  };
  const dotColors = {
    live: "bg-[#7FE295]",
    draft: "bg-amber",
    stale: "bg-ink-40",
  };

  return (
    <span className={`${base} ${variants[variant]} ${className}`}>
      {(variant === "live" || variant === "draft" || variant === "stale") && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: shared UI components — Button, Input, Pill + design tokens"
```

---

## Task 8: Frontend �� auth (useAuth hook + sign-in page)

**Files:**
- Create: `frontend/src/hooks/useAuth.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/app/sign-in/page.tsx`
- Modify: `frontend/src/app/layout.tsx` — nothing structural, just ensure fonts are set

- [ ] **Step 1: Create `frontend/src/lib/api.ts`**

```tsx
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("pulp_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("pulp_token");
    window.location.href = "/sign-in";
    throw new Error("Unauthorized");
  }

  return res;
}
```

- [ ] **Step 2: Create `frontend/src/hooks/useAuth.ts`**

```tsx
"use client";
import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export function useAuth() {
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("pulp_token") : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!token;

  const login = useCallback(async (password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Login failed");
      }
      const data = await res.json();
      localStorage.setItem("pulp_token", data.token);
      setToken(data.token);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("pulp_token");
    setToken(null);
  }, []);

  return { isAuthenticated, login, logout, loading, error };
}
```

- [ ] **Step 3: Create sign-in page**

Build `/sign-in/page.tsx` from the handoff design: two-column split (left: password form, right: testimonial quote). Use the `SignInForm` component. On successful login, redirect to `/generate`.

Reference: handoff README section "1. Sign in (`#signin`)" and the HTML prototype `#signin` div.

Adapt for password-only: remove email field, keep password input, keep Google button hidden or remove, keep the visual design (Fraunces headlines, hard-offset input shadows, testimonial right column).

- [ ] **Step 4: Test sign-in flow**

Start frontend (`npm run dev`), navigate to `/sign-in`, enter password, verify redirect.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: auth �� useAuth hook, api client, sign-in page"
```

---

## Task 9: Frontend — app shell (Rail + Topbar)

**Files:**
- Create: `frontend/src/components/shell/Rail.tsx`
- Create: `frontend/src/components/shell/Topbar.tsx`
- Create: `frontend/src/components/shell/UserChip.tsx`
- Create: `frontend/src/app/(app)/layout.tsx`
- Create: `frontend/src/app/(app)/page.tsx`

- [ ] **Step 1: Create `Rail.tsx`**

From handoff: 240px fixed sidebar with brand lockup, nav links (Generate active, History, Voice active; Overview, Locations, Queue, Integrations, Settings disabled), user chip at bottom.

Reference: handoff README "Left rail components" section and HTML prototype `aside.rail`.

Nav items with icons (inline SVGs matching the handoff's symbol defs). Active state: ink bg, white text. Disabled items: ink-40 text, no hover, no click.

- [ ] **Step 2: Create `Topbar.tsx`**

Search input (disabled/placeholder only), spacer, cmd-K hint pill, "Press publish" button (disabled today).

Reference: handoff README "Topbar row" section.

- [ ] **Step 3: Create `UserChip.tsx`**

Avatar circle with initial, name, email (hardcoded to "Pulp User" / derived from auth), sign-out button.

- [ ] **Step 4: Create `(app)/layout.tsx`**

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Rail } from "@/components/shell/Rail";
import { Topbar } from "@/components/shell/Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) router.replace("/sign-in");
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] max-[900px]:grid-cols-1">
      <Rail onSignOut={logout} />
      <main className="min-w-0 p-8 pb-20 max-[700px]:p-6" style={{ padding: "32px 44px 80px" }}>
        <Topbar />
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Create `(app)/page.tsx`**

```tsx
import { redirect } from "next/navigation";
export default function AppRoot() {
  redirect("/generate");
}
```

- [ ] **Step 6: Verify shell renders**

Navigate to `/generate` (create empty placeholder page if needed). Rail + topbar should render with the Pulp design.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: app shell — Rail, Topbar, UserChip, auth-gated layout"
```

---

## Task 10: Frontend — generate page (inputs + pipeline progress)

**Files:**
- Create: `frontend/src/components/generate/KeywordInput.tsx`
- Create: `frontend/src/components/generate/TemplateSelector.tsx`
- Create: `frontend/src/components/generate/CompetitorInput.tsx`
- Create: `frontend/src/components/generate/PipelineProgress.tsx`
- Create: `frontend/src/app/(app)/generate/page.tsx`

- [ ] **Step 1: Create `KeywordInput.tsx`**

Three fields in a row: keyword (text input), city (text input), state (text input, short). Uses the shared `Input` component. Controlled via props.

- [ ] **Step 2: Create `TemplateSelector.tsx`**

Dropdown that fetches from `GET /api/notion/templates?brand=USA Insulation`. Shows template name + page type. On select, fetches full template via `GET /api/notion/templates/:id`.

- [ ] **Step 3: Create `CompetitorInput.tsx`**

Textarea for entering competitor URLs (one per line). Optional. Parses newlines into an array of URLs. Shows count of entered URLs.

```tsx
"use client";
import { useState } from "react";

interface CompetitorInputProps {
  urls: string[];
  onChange: (urls: string[]) => void;
}

export function CompetitorInput({ urls, onChange }: CompetitorInputProps) {
  const [text, setText] = useState(urls.join("\n"));

  function handleChange(value: string) {
    setText(value);
    const parsed = value.split("\n").map(u => u.trim()).filter(Boolean);
    onChange(parsed);
  }

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-[10px] tracking-[0.22em] uppercase text-ink-70">
          Competitor URLs (optional)
        </label>
        {urls.length > 0 && (
          <span className="text-[10px] text-ink-40">{urls.length} URL{urls.length !== 1 ? "s" : ""}</span>
        )}
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder="https://competitor1.com/page&#10;https://competitor2.com/page"
        rows={3}
        className="w-full border-[1.5px] border-line rounded-[14px] bg-white text-ink px-4 py-3 font-mono text-[13px] outline-none transition-all duration-150 focus:border-ink focus:shadow-[4px_4px_0_0_var(--ink)] resize-none"
      />
    </div>
  );
}
```

- [ ] **Step 4: Create `PipelineProgress.tsx`**

Shows status of each research step: brief, competitors, PAA, style examples, template. Each step shows: pending (gray dot), loading (animated), done (green dot + check), failed (red + warning), skipped (gray + skip).

```tsx
interface PipelineStep {
  label: string;
  status: "pending" | "loading" | "done" | "failed" | "skipped";
}
export function PipelineProgress({ steps }: { steps: PipelineStep[] }) { ... }
```

- [ ] **Step 4: Create generate page**

Orchestrates the full flow. State machine:
- `idle` — showing inputs
- `researching` — running parallel research calls
- `outline` — showing outline for review
- `generating` — streaming content
- `scoring` — running POP score
- `revising` — auto-revising (if score < 75)
- `done` — showing final content + score

Wire up: keyword/city inputs, template selector, "Generate" button triggers research phase.

- [ ] **Step 5: Verify inputs render and template fetches**

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: generate page — keyword input, template selector, pipeline progress"
```

---

## Task 11: Frontend — useGeneration hook (SSE streaming)

**Files:**
- Create: `frontend/src/hooks/useGeneration.ts`

- [ ] **Step 1: Create `useGeneration.ts`**

Port from `content-gen/frontend/src/hooks/useGeneration.js`:
- State: `output`, `isGenerating`, `error`, `usage`
- `generate(url, payload)` — POST with SSE, parse `data: {JSON}\n\n` events
- `abort()` — AbortController cancel
- Buffer management: split on `\n`, keep incomplete final line
- Event types: `chunk` (append text), `done` (finalize), `error` (set error)
- On `AbortError`: return silently (user cancelled)

```tsx
"use client";
import { useState, useRef, useCallback } from "react";
import { API_URL } from "@/lib/api";

export function useGeneration() {
  const [output, setOutput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ input_tokens: number; output_tokens: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (path: string, payload: any) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setOutput("");
    setIsGenerating(true);
    setError(null);
    setUsage(null);

    const token = localStorage.getItem("pulp_token");
    let fullText = "";

    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk") {
              fullText += data.text;
              setOutput(fullText);
            } else if (data.type === "done") {
              setOutput(data.content);
              if (data.usage) setUsage(data.usage);
            } else if (data.type === "error") {
              setError(data.message);
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message || "Generation failed");
    } finally {
      setIsGenerating(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsGenerating(false);
    }
  }, []);

  return { output, setOutput, isGenerating, error, usage, generate, abort };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useGeneration.ts
git commit -m "feat: useGeneration hook — SSE streaming with abort support"
```

---

## Task 12: Frontend — outline review + content viewer + POP score

**Files:**
- Create: `frontend/src/components/generate/OutlineReview.tsx`
- Create: `frontend/src/components/generate/ContentViewer.tsx`
- Create: `frontend/src/components/generate/TermHeatmap.tsx`
- Create: `frontend/src/components/generate/POPScoreCard.tsx`

- [ ] **Step 1: Create `OutlineReview.tsx`**

Renders the outline JSON: H1 as heading, sections as H2 cards with key points. Approve button + Edit toggle. When editing, H2s and key points become editable text inputs.

- [ ] **Step 2: Create `ContentViewer.tsx`**

Renders markdown content in a styled container. During streaming: shows content as it arrives. After completion: renders with term heatmap overlay. Includes "Copy" button (copies markdown to clipboard).

- [ ] **Step 3: Create `TermHeatmap.tsx`**

Given content + POP brief term targets, highlights matched terms in green and missed terms listed in red below the content. Uses regex to find term occurrences in the content text.

- [ ] **Step 4: Create `POPScoreCard.tsx`**

Displays: overall score (large number), term score, word count score, recommendations list, well-optimized terms, missing terms. "Revise" button triggers revision flow.

Reference: content-gen's `POPScoreCard.jsx` for layout patterns. Apply Pulp design tokens (ink borders, hard shadows, Fraunces numbers).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/generate/
git commit -m "feat: generate components — outline review, content viewer, term heatmap, POP score"
```

---

## Task 13a: Frontend — wire research + outline phases

Connect inputs to the research pipeline and outline review.

**Files:**
- Modify: `frontend/src/app/(app)/generate/page.tsx`

- [ ] **Step 1: Wire research phase**

On "Generate" click, fire parallel fetches. **Error handling by criticality:**

Required (abort pipeline on failure, show error):
- POP brief (POST `/api/brief`)
- Style examples (GET `/api/style-examples?brand_id=...`)
- Notion template (GET `/api/notion/templates/:id`)

Optional (mark as "skipped" on failure, continue):
- Competitor scrape (POST `/api/scrape`) -- only if URLs entered
- SERP/PAA (POST `/api/serp`)

Update PipelineProgress per step. On all required done, advance to outline.

- [ ] **Step 2: Wire outline phase**

POST to `/api/generate/outline` with research results. Show OutlineReview. On approve, advance to generation.

- [ ] **Step 3: Test research + outline**

Enter keyword, select template, click Generate. Verify pipeline progress shows each step. Verify outline renders and approve button works.

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: wire research pipeline + outline review with error handling"
```

---

## Task 13b: Frontend — wire generation + scoring + revision

Connect streaming generation, POP scoring, and auto-revision loop.

**Files:**
- Modify: `frontend/src/app/(app)/generate/page.tsx`

- [ ] **Step 1: Wire generation phase**

Call `useGeneration.generate("/api/generate", payload)`. Show ContentViewer with streaming output. On done, advance to scoring.

- [ ] **Step 2: Wire scoring phase**

POST to `/api/score` with generated content + keyword. Show POPScoreCard. If score < 75 and revision_count < 2, auto-revise. Otherwise, advance to done.

- [ ] **Step 3: Wire revision phase**

Call `useGeneration.generate("/api/generate/revise", payload)`. Increment revision count. After revision completes, re-score.

- [ ] **Step 4: Wire done phase**

Show final content with term heatmap + POP score. Action buttons: Save to history (POST `/api/generations`), Copy (clipboard), Export to Drive (POST `/api/export/gdrive`). Content is editable via `setOutput` from `useGeneration`.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: wire generation + POP scoring + auto-revision loop"
```

---

## Task 13c: Frontend — full pipeline integration test

- [ ] **Step 1: End-to-end test**

Enter keyword "insulation services" + city "Columbus" + state "OH". Select template. Generate. Verify full flow: research, outline, content streaming, POP score, review. Test save to history. Test copy to clipboard.

- [ ] **Step 2: Test error paths**

Test with missing POP API key (should abort). Test with no competitor URLs (should skip scrape). Test abort button during generation.

- [ ] **Step 3: Commit any fixes**

```bash
git add frontend/
git commit -m "fix: pipeline integration fixes from end-to-end testing"
```

---

## Task 14: Frontend — history page

**Files:**
- Create: `frontend/src/components/history/GenerationsList.tsx`
- Create: `frontend/src/components/history/GenerationDetail.tsx`
- Create: `frontend/src/app/(app)/history/page.tsx`

- [ ] **Step 1: Create `GenerationsList.tsx`**

Table of past generations: keyword, city, template, word count, POP score, date. Click row to select. Delete button per row.

Fetch from `GET /api/generations?brand_id=<brand_id>`.

- [ ] **Step 1b: Create `GenerationDetail.tsx`**

Expanded view for a selected generation: full content rendered as markdown, POP score card (if score exists), outline (if stored), metadata (model, tokens, revision count, date). Action buttons: Copy, Export to Drive, Delete.

- [ ] **Step 2: Create history page**

Loads brand ID (from first brand in list), renders GenerationsList.

- [ ] **Step 3: Commit**

```bash
git add frontend/
git commit -m "feat: history page — list and view past generations"
```

---

## Task 15: Frontend — voice page (style examples)

**Files:**
- Create: `frontend/src/components/voice/StyleExamplesList.tsx`
- Create: `frontend/src/components/voice/AddStyleExample.tsx`
- Create: `frontend/src/app/(app)/voice/page.tsx`

- [ ] **Step 1: Create `StyleExamplesList.tsx`**

List of style examples with title, word count, preview. Delete button per row.

- [ ] **Step 2: Create `AddStyleExample.tsx`**

Form: title, URL (optional), content (textarea). On submit: POST to `/api/style-examples`. Auto-calculates word count.

- [ ] **Step 3: Create voice page**

Renders list + add form. Fetches from `GET /api/style-examples?brand_id=<brand_id>`.

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: voice page — manage style examples for brand voice"
```

---

## Task 16: Update Render config + final wiring

**Files:**
- Modify: `render.yaml` — add new env vars
- Modify: `backend/Dockerfile` — ensure app/ copied

- [ ] **Step 1: Update `render.yaml`**

Add all new env vars to the backend service: APP_PASSWORD, JWT_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY, NOTION_API_KEY, NOTION_DATABASE_ID, JINA_API_KEY, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD, GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_DRIVE_FOLDER_ID, FRONTEND_URL.

- [ ] **Step 2: Update frontend env**

Add `NEXT_PUBLIC_API_URL` pointing to the Render backend URL.

- [ ] **Step 3: Test full flow locally**

1. Sign in with password
2. Navigate to /generate
3. Enter keyword + city
4. Select template
5. Run pipeline
6. Review outline → approve
7. Watch content stream
8. View POP score
9. Save to history
10. Export to Google Drive

- [ ] **Step 4: Commit**

```bash
git add render.yaml backend/Dockerfile
git commit -m "chore: update Render config with all env vars"
```

---

## Task Order & Dependencies

```
Task 1: Backend restructure (no deps)
Task 2: Supabase schema (no deps — run in Supabase dashboard)
Task 3: CRUD routers (depends on 1, 2)
Task 4: Research services (depends on 1)
Task 5: SSE + outline + revise (depends on 1, 4)
Task 6: Google Drive export (depends on 1)
Task 7: Frontend shared components (no deps)
Task 8: Frontend auth (depends on 7)
Task 9: Frontend app shell (depends on 7, 8)
Task 10: Frontend generate inputs (depends on 9)
Task 11: useGeneration hook (depends on 7)
Task 12: Generate review components (depends on 7, 11)
Task 13a: Wire research + outline (depends on 10, 11, 12 + backend tasks 3-5)
Task 13b: Wire generation + scoring + revision (depends on 13a)
Task 13c: Integration test (depends on 13b + backend task 6)
Task 14: History page (depends on 9)
Task 15: Voice page (depends on 9)
Task 16: Render config (depends on all)
```

**Parallelizable groups:**
- Group A (backend): Tasks 1 → 3, 4, 5, 6 (1 first, then 3-6 in parallel)
- Group B (frontend): Tasks 7 → 8 → 9 → 10, 11, 12 → 13a → 13b → 13c → 14, 15
- Task 2: Independent (Supabase dashboard)
- Task 16: After everything
