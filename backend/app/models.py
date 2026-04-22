"""Pydantic request/response models."""
from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel


# Auth
class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


# Brief
class BriefRequest(BaseModel):
    keyword: str
    target_url: Optional[str] = None
    location: Optional[str] = None


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
    template: Optional[dict[str, Any]] = None
    outline: Optional[dict[str, Any]] = None
    style_examples: Optional[list[dict[str, Any]]] = None
    competitor_content: Optional[list[dict[str, Any]]] = None
    services: list[str] = []
    content_type: str = "landing_page"
    business_name: str = ""
    brand_id: Optional[str] = None
    location_id: Optional[str] = None


class OutlineRequest(BaseModel):
    keyword: str
    city: str
    state: str = ""
    brief: dict[str, Any]
    template: Optional[dict[str, Any]] = None
    paa_questions: Optional[list[str]] = None
    competitors: Optional[list[dict[str, Any]]] = None
    style_examples: Optional[list[dict[str, Any]]] = None


class ReviseRequest(BaseModel):
    content: str
    keyword: str
    brief: dict[str, Any]
    pop_feedback: dict[str, Any] = {}


# Score
class ScoreRequest(BaseModel):
    content: str
    keyword: str
    target_url: Optional[str] = None


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
    location: Optional[str] = None


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
    location_id: Optional[str] = None
    outline: Optional[str] = None
    content_type: str = "landing_page"
    template_name: Optional[str] = None
    model: str = "sonnet"
    word_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    pop_brief: Optional[dict[str, Any]] = None
    pop_score: Optional[dict[str, Any]] = None
    revision_count: int = 0
