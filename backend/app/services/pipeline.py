"""Server-side content generation pipeline."""
from __future__ import annotations
import asyncio
import json
import logging
import threading
from typing import Any, Optional

from app.config import POP_API_KEY, ANTHROPIC_API_KEY
from app.db import get_db

logger = logging.getLogger(__name__)


def _update_job(job_id: str, **fields):
    """Update pipeline job in Supabase."""
    try:
        db = get_db()
        db.table("pipeline_jobs").update(fields).eq("id", job_id).execute()
    except Exception as e:
        logger.error(f"Failed to update pipeline job {job_id}: {e}")


def run_pipeline(
    job_id: str,
    keyword: str,
    city: str,
    state: str,
    brand_id: str,
    location_id: Optional[str] = None,
    template_id: Optional[str] = None,
    content_type: str = "landing_page",
    competitor_urls: Optional[list] = None,
):
    """Run the full pipeline in a background thread."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_run_pipeline_async(
            job_id, keyword, city, state, brand_id,
            location_id, template_id, content_type, competitor_urls,
        ))
    except Exception as e:
        logger.error(f"Pipeline {job_id} failed: {e}")
        _update_job(job_id, phase="error", error=str(e))
    finally:
        loop.close()


async def _run_pipeline_async(
    job_id: str,
    keyword: str,
    city: str,
    state: str,
    brand_id: str,
    location_id: Optional[str],
    template_id: Optional[str],
    content_type: str,
    competitor_urls: Optional[list],
):
    """Async pipeline implementation."""
    import anthropic
    from app.config import ANTHROPIC_API_KEY
    from app.services.pop import get_enriched_brief, score_content_with_pop, stub_score
    from app.services.content_generator import (
        build_system_prompt, build_user_prompt,
        build_outline_prompt, build_revision_prompts,
    )

    db = get_db()

    # Load brand data
    brand_data = {}
    if brand_id:
        try:
            result = db.table("brands").select("*").eq("id", brand_id).single().execute()
            brand_data = result.data or {}
        except Exception:
            pass

    # Load location data
    local_context = None
    if location_id:
        try:
            result = db.table("locations").select("local_context").eq("id", location_id).single().execute()
            local_context = (result.data or {}).get("local_context")
        except Exception:
            pass

    # Load style examples
    style_examples = []
    if brand_id:
        try:
            result = db.table("style_examples").select("*").eq("brand_id", brand_id).execute()
            style_examples = result.data or []
        except Exception:
            pass

    # Load template from Notion if template_id provided
    template_content = None
    if template_id:
        try:
            from app.services.notion import get_template
            template_content = get_template(template_id)
        except Exception as e:
            logger.warning(f"Template load failed: {e}")

    # -- STEP 1: SEO Brief --
    _update_job(job_id, phase="brief")
    try:
        brief = await get_enriched_brief(
            keyword=keyword,
            location_name=f"{city}, {state}" if state else city,
        )
        _update_job(job_id, brief=brief)
    except Exception as e:
        _update_job(job_id, phase="error", error=f"SEO brief failed: {e}")
        return

    # -- STEP 2: Outline --
    _update_job(job_id, phase="outline")
    try:
        system, user = build_outline_prompt(
            keyword=keyword, city=city, state=state,
            brief=brief, template=template_content,
            paa=[],  # PAA fetched separately if available
            competitors=[],
        )
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000, temperature=0.3,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        raw = "".join(b.text for b in response.content if hasattr(b, "text"))
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        outline = json.loads(raw)
        _update_job(job_id, outline=outline)
    except Exception as e:
        logger.warning(f"Outline generation failed, continuing without: {e}")
        outline = None

    # -- STEP 3: Generate Content --
    _update_job(job_id, phase="generating")
    try:
        system_prompt = build_system_prompt(
            template=template_content,
            style_examples=style_examples,
            voice_dimensions=brand_data.get("voice_dimensions"),
            voice_notes=brand_data.get("voice_notes"),
            brand_banned_words=brand_data.get("brand_banned_words"),
            brand_guidelines=brand_data.get("brand_guidelines"),
        )
        user_prompt = build_user_prompt(
            keyword=keyword, city=city, state=state,
            brief=brief, template=template_content, outline=outline,
            competitors=[], style_examples=style_examples,
            local_context=local_context,
        )

        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        full_text = ""
        usage = {"input_tokens": 0, "output_tokens": 0}

        async with client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=12000, temperature=0.4,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            async for event in stream:
                if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                    full_text += event.delta.text

            msg = await stream.get_final_message()
            if msg and msg.usage:
                usage["input_tokens"] = msg.usage.input_tokens
                usage["output_tokens"] = msg.usage.output_tokens

        # Strip em dashes
        full_text = full_text.replace("\u2014", "-").replace("\u2013", "-")
        word_count = len(full_text.split())

        _update_job(
            job_id, content=full_text,
            word_count=word_count,
            input_tokens=usage["input_tokens"],
            output_tokens=usage["output_tokens"],
        )
    except Exception as e:
        _update_job(job_id, phase="error", error=f"Content generation failed: {e}")
        return

    # -- STEP 4: Score --
    _update_job(job_id, phase="scoring")
    try:
        if POP_API_KEY:
            score_result = await score_content_with_pop(
                content=full_text, target_keyword=keyword,
            )
        else:
            score_result = stub_score(content=full_text, target_keyword=keyword)
        _update_job(job_id, score=score_result)
    except Exception as e:
        logger.warning(f"Scoring failed: {e}")
        score_result = None

    # -- STEP 5: Auto-revise if score < 75 (max 2 rounds) --
    revision_count = 0
    if score_result and score_result.get("overall_score", 100) < 75:
        for rev_round in range(2):
            _update_job(job_id, phase="revising", revision_count=revision_count + 1)
            try:
                system_rev, user_rev = build_revision_prompts(
                    content=full_text, keyword=keyword,
                    brief=brief, pop_feedback=score_result,
                )
                revised_text = ""
                async with client.messages.stream(
                    model="claude-sonnet-4-20250514",
                    max_tokens=12000, temperature=0.4,
                    system=system_rev,
                    messages=[{"role": "user", "content": user_rev}],
                ) as stream:
                    async for event in stream:
                        if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                            revised_text += event.delta.text

                revised_text = revised_text.replace("\u2014", "-").replace("\u2013", "-")
                full_text = revised_text
                word_count = len(full_text.split())
                revision_count += 1

                _update_job(job_id, content=full_text, word_count=word_count, revision_count=revision_count)

                # Re-score
                _update_job(job_id, phase="scoring")
                if POP_API_KEY:
                    score_result = await score_content_with_pop(
                        content=full_text, target_keyword=keyword,
                    )
                else:
                    score_result = stub_score(content=full_text, target_keyword=keyword)
                _update_job(job_id, score=score_result)

                if score_result.get("overall_score", 100) >= 75:
                    break
            except Exception as e:
                logger.warning(f"Revision round {rev_round + 1} failed: {e}")
                break

    # -- Done --
    _update_job(job_id, phase="done")
