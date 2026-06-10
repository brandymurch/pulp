"""Pydantic request/response models."""
from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field

# Shared max-length bounds for user-supplied strings
MAX_CONTENT_LEN = 200_000
MAX_KEYWORD_LEN = 500
MAX_URL_LEN = 2000
MAX_FEEDBACK_LEN = 10_000


# Auth
class LoginRequest(BaseModel):
    password: str = Field(max_length=500)


class LoginResponse(BaseModel):
    token: str


# Brief
class BriefRequest(BaseModel):
    keyword: str = Field(max_length=MAX_KEYWORD_LEN)
    target_url: str | None = Field(default=None, max_length=MAX_URL_LEN)
    location: str | None = Field(default=None, max_length=MAX_KEYWORD_LEN)


class BriefResponse(BaseModel):
    target_word_count: int
    term_targets: list[dict[str, Any]]
    lsa_phrases: list[Any]


# Generate (legacy, kept for standalone endpoint)
class GenerateRequest(BaseModel):
    keyword: str = Field(max_length=MAX_KEYWORD_LEN)
    city: str = Field(max_length=200)
    state: str = Field(default="", max_length=100)
    brief: dict[str, Any]
    template: dict[str, Any] | None = None
    outline: dict[str, Any] | None = None
    style_examples: list[dict[str, Any]] | None = None
    competitor_content: list[dict[str, Any]] | None = None
    services: list[str] = []
    content_type: str = Field(default="landing_page", max_length=100)
    business_name: str = Field(default="", max_length=MAX_KEYWORD_LEN)
    brand_id: str | None = None
    location_id: str | None = None


class OutlineRequest(BaseModel):
    keyword: str = Field(max_length=MAX_KEYWORD_LEN)
    city: str = Field(max_length=200)
    state: str = Field(default="", max_length=100)
    brief: dict[str, Any]
    template: dict[str, Any] | None = None
    paa_questions: list[str] | None = None
    competitors: list[dict[str, Any]] | None = None
    style_examples: list[dict[str, Any]] | None = None


class ReviseRequest(BaseModel):
    content: str = Field(max_length=MAX_CONTENT_LEN)
    keyword: str = Field(max_length=MAX_KEYWORD_LEN)
    brief: dict[str, Any]
    pop_feedback: dict[str, Any] = {}


# Score
class ScoreRequest(BaseModel):
    content: str = Field(max_length=MAX_CONTENT_LEN)
    keyword: str = Field(max_length=MAX_KEYWORD_LEN)
    target_url: str | None = Field(default=None, max_length=MAX_URL_LEN)


class ScoreResponse(BaseModel):
    overall_score: int
    term_score: int
    word_count_score: int
    recommendations: list[str]
    well_optimized: list[dict[str, Any]]
    missing: list[dict[str, Any]]


# Scrape
class ScrapeRequest(BaseModel):
    url: str = Field(max_length=MAX_URL_LEN)


# SERP
class SerpRequest(BaseModel):
    keyword: str = Field(max_length=MAX_KEYWORD_LEN)
    location: str | None = Field(default=None, max_length=MAX_KEYWORD_LEN)


# Google Drive Export
class ExportGDriveRequest(BaseModel):
    title: str = Field(max_length=MAX_KEYWORD_LEN)
    content: str = Field(max_length=MAX_CONTENT_LEN)
    keyword: str = Field(default="", max_length=MAX_KEYWORD_LEN)
    city: str = Field(default="", max_length=200)
    brand_id: str


class ExportGDriveResponse(BaseModel):
    doc_url: str
    doc_id: str


# Save Generation
class SaveGenerationRequest(BaseModel):
    brand_id: str
    keyword: str = Field(max_length=MAX_KEYWORD_LEN)
    city: str = Field(default="", max_length=200)
    content: str = Field(max_length=MAX_CONTENT_LEN)
    location_id: str | None = None
    outline: str | None = Field(default=None, max_length=MAX_CONTENT_LEN)
    content_type: str = Field(default="landing_page", max_length=100)
    template_name: str | None = Field(default=None, max_length=MAX_KEYWORD_LEN)
    model: str = Field(default="sonnet", max_length=100)
    word_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    pop_brief: dict[str, Any] | None = None
    pop_score: dict[str, Any] | None = None
    revision_count: int = 0
