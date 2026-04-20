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
    lsa_phrases: list[str]


# Generate
class GenerateRequest(BaseModel):
    keyword: str
    brief: dict[str, Any]
    business_name: str
    city: str
    services: list[str] = []
    content_type: str = "blog_post"


class GenerateResponse(BaseModel):
    title: str
    content: str
    word_count: int


class OutlineRequest(BaseModel):
    keyword: str
    brief: dict[str, Any]
    business_name: str
    city: str
    services: list[str] = []
    content_type: str = "blog_post"


class ReviseRequest(BaseModel):
    content: str
    keyword: str
    brief: dict[str, Any]
    instructions: str = ""


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
    content: str
    title: str
    folder_id: Optional[str] = None


class ExportGDriveResponse(BaseModel):
    file_id: str
    web_view_link: str


# Save Generation
class SaveGenerationRequest(BaseModel):
    keyword: str
    title: str
    content: str
    word_count: int
    score: Optional[dict[str, Any]] = None
    brief: Optional[dict[str, Any]] = None
