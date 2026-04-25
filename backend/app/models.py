"""Pydantic request/response models."""
from __future__ import annotations
from typing import Any
from pydantic import BaseModel


# Auth
class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


# Brief
class BriefRequest(BaseModel):
    keyword: str
    target_url: str | None = None
    location: str | None = None


class BriefResponse(BaseModel):
    target_word_count: int
    term_targets: list[dict[str, Any]]
    lsa_phrases: list[Any]


# Generate (legacy, kept for standalone endpoint)
class GenerateRequest(BaseModel):
    keyword: str
    city: str
    state: str = ""
    brief: dict[str, Any]
    template: dict[str, Any] | None = None
    outline: dict[str, Any] | None = None
    style_examples: list[dict[str, Any]] | None = None
    competitor_content: list[dict[str, Any]] | None = None
    services: list[str] = []
    content_type: str = "landing_page"
    business_name: str = ""
    brand_id: str | None = None
    location_id: str | None = None


class OutlineRequest(BaseModel):
    keyword: str
    city: str
    state: str = ""
    brief: dict[str, Any]
    template: dict[str, Any] | None = None
    paa_questions: list[str] | None = None
    competitors: list[dict[str, Any]] | None = None
    style_examples: list[dict[str, Any]] | None = None


class ReviseRequest(BaseModel):
    content: str
    keyword: str
    brief: dict[str, Any]
    pop_feedback: dict[str, Any] = {}


# Score
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
    url: str


# SERP
class SerpRequest(BaseModel):
    keyword: str
    location: str | None = None


# Google Drive Export
class ExportGDriveRequest(BaseModel):
    title: str
    content: str
    keyword: str = ""
    city: str = ""
    brand_id: str


class ExportGDriveResponse(BaseModel):
    doc_url: str
    doc_id: str


# Save Generation
class SaveGenerationRequest(BaseModel):
    brand_id: str
    keyword: str
    city: str = ""
    content: str
    location_id: str | None = None
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
