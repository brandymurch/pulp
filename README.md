# Pulp

POP + Claude content creation tool. Generate SEO-optimized content using Page Optimizer Pro briefs and Claude AI.

## What it does

1. Enter a target keyword + business context
2. Get a POP optimization brief (target terms, word count)
3. Claude generates content pre-optimized for the brief
4. POP scores the draft
5. Edit, re-score, and export

## Stack

- **Frontend**: Next.js 16 App Router, TypeScript, Tailwind CSS
- **Backend**: Python FastAPI (single file)
- **APIs**: Page Optimizer Pro, Anthropic Claude

## Local Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export POP_API_KEY=your_key
export ANTHROPIC_API_KEY=your_key

uvicorn main:app --reload --port 8001
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`, backend on `http://localhost:8001`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POP_API_KEY` | Yes | Page Optimizer Pro API key |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `NEXT_PUBLIC_API_URL` | No | Backend URL (defaults to `http://localhost:8001`) |

## Deployment

Configured for Render via `render.yaml`. Push to deploy both services.
