"""Pulp API entry point."""
from __future__ import annotations
import logging
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import FRONTEND_URL
from app.routers import auth, brief, score, generate, brands, style_examples, generations, scrape, serp, notion_templates, export, locations, pipeline

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
app.include_router(brands.router)
app.include_router(style_examples.router)
app.include_router(generations.router)
app.include_router(scrape.router)
app.include_router(serp.router)
app.include_router(notion_templates.router)
app.include_router(export.router)
app.include_router(locations.router)
app.include_router(pipeline.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
