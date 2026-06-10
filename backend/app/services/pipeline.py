"""Server-side content generation pipeline."""
from __future__ import annotations
import asyncio
import json
import logging

from app.db import get_db

logger = logging.getLogger(__name__)

# Key inside the brief jsonb column where phase-1 context is parked across
# the outline-approval pause (the table has no dedicated context column).
PIPELINE_CONTEXT_KEY = "_pipeline_context"


def _update_job(job_id: str, **fields):
    """Update pipeline job in Supabase. Always touches updated_at so the
    stale-job sweep in the status endpoint can tell live jobs from dead ones."""
    try:
        fields.setdefault("updated_at", "now()")
        db = get_db()
        db.table("pipeline_jobs").update(fields).eq("id", job_id).execute()
    except Exception as e:
        logger.error("Failed to update pipeline job %s: %s", job_id, e)


def run_pipeline(
    job_id: str,
    keyword: str,
    city: str,
    state: str,
    brand_id: str,
    location_id: str | None = None,
    template_id: str | None = None,
    content_type: str = "landing_page",
    competitor_urls: list | None = None,
    feedback: str | None = None,
):
    """Run the full pipeline in a background thread."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_run_pipeline_async(
            job_id, keyword, city, state, brand_id,
            location_id, template_id, content_type, competitor_urls, feedback,
        ))
    except Exception as e:
        logger.error("Pipeline %s failed: %s", job_id, e)
        _update_job(job_id, phase="error", error=str(e))
    finally:
        loop.close()


def resume_pipeline(job_id: str, approval_feedback: str | None = None):
    """Resume pipeline after outline approval. Runs in a background thread."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_resume_pipeline_async(job_id, approval_feedback))
    except Exception as e:
        logger.error("Pipeline resume %s failed: %s", job_id, e)
        _update_job(job_id, phase="error", error=str(e))
    finally:
        loop.close()


async def _resume_pipeline_async(job_id: str, approval_feedback: str | None = None):
    """Load job data from Supabase and continue from phase 2."""
    db = get_db()
    result = db.table("pipeline_jobs").select("*").eq("id", job_id).single().execute()
    job = result.data
    if not job:
        raise RuntimeError(f"Pipeline job {job_id} not found")

    keyword = job["keyword"]
    city = job["city"]
    state = job.get("state", "")
    brand_id = job.get("brand_id", "")
    location_id = job.get("location_id")
    content_type = job.get("content_type", "landing_page")
    outline = job.get("outline")
    brief = job.get("brief") or {}

    # Rehydrate phase-1 context parked on the brief across the approval pause:
    # scraped competitors, PAA questions, start-request feedback + competitor URLs.
    pause_ctx = {}
    if isinstance(brief, dict):
        pause_ctx = brief.pop(PIPELINE_CONTEXT_KEY, None) or {}
    competitors = pause_ctx.get("competitors") or []
    paa_questions = pause_ctx.get("paa_questions") or []
    feedback_parts = [
        f for f in (pause_ctx.get("feedback"), approval_feedback)
        if f and f.strip()
    ]
    feedback = "\n".join(feedback_parts) or None

    # Reload brand, style examples, template, location data
    brand_data = {}
    if brand_id:
        try:
            r = db.table("brands").select("*").eq("id", brand_id).single().execute()
            brand_data = r.data or {}
        except Exception:
            pass

    style_examples = []
    if brand_id:
        try:
            r = db.table("style_examples").select("*").eq("brand_id", brand_id).execute()
            style_examples = r.data or []
        except Exception:
            pass

    local_context = None
    if location_id:
        try:
            r = db.table("locations").select("local_context").eq("id", location_id).single().execute()
            local_context = (r.data or {}).get("local_context")
        except Exception:
            pass

    template_content = None

    research = job.get("research")

    await _run_pipeline_phase2(
        job_id, keyword, city, state, brand_id, location_id,
        content_type, outline, brief, brand_data, style_examples,
        template_content, local_context,
        competitors=competitors, feedback=feedback,
        research=research, paa_questions=paa_questions,
    )


async def _run_pipeline_async(
    job_id: str,
    keyword: str,
    city: str,
    state: str,
    brand_id: str,
    location_id: str | None,
    template_id: str | None,
    content_type: str,
    competitor_urls: list | None,
    feedback: str | None = None,
):
    """Async pipeline implementation."""
    from app.services.pop import get_enriched_brief
    from app.services.claude import get_client, MODELS, extract_json
    from app.services.content_generator import (
        build_outline_prompt, build_research_prompt,
        RESEARCH_SCHEMA, OUTLINE_SCHEMA,
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

    # Brand-level templates are now used instead of Notion
    template_content = None

    # -- STEP 1: SEO Brief + Competitors + SERP (parallel) --
    _update_job(job_id, phase="brief")

    # Run brief, SERP, and competitor scraping in parallel
    from app.services.serp import get_serp_results
    from app.services.scraper import scrape_urls

    brief = None
    serp_data = {"paa_questions": [], "ai_fanout_queries": [], "related_searches": []}
    competitors_scraped = []

    async def fetch_brief():
        nonlocal brief
        brief = await get_enriched_brief(
            keyword=keyword,
            location_name=f"{city}, {state}" if state else city,
        )

    async def fetch_serp():
        nonlocal serp_data
        try:
            serp_data = await get_serp_results(keyword, f"{city}, {state}")
        except Exception as e:
            logger.warning("SERP fetch failed (continuing): %s", e)

    async def fetch_competitors():
        nonlocal competitors_scraped
        try:
            urls = competitor_urls or []
            # If no manual URLs, use top organic results from SERP
            if not urls and serp_data.get("organic_results"):
                urls = [r["url"] for r in serp_data["organic_results"][:3] if r.get("url")]
            if urls:
                competitors_scraped = await scrape_urls(urls[:3])
        except Exception as e:
            logger.warning("Competitor scraping failed (continuing): %s", e)

    # Brief is required, SERP and competitors are optional
    try:
        # Run brief and SERP in parallel first. Capture results so the real
        # brief exception (e.g. PopApiError with a specific message) reaches
        # the job row and the UI instead of a generic message.
        results = await asyncio.gather(fetch_brief(), fetch_serp(), return_exceptions=True)
        brief_error = results[0]
        if isinstance(brief_error, BaseException):
            _update_job(job_id, phase="error", error=f"SEO brief failed: {brief_error}")
            return
        if brief is None:
            _update_job(job_id, phase="error", error="SEO brief failed: POP returned no brief data")
            return
        # Then scrape competitors (may use SERP organic URLs)
        await fetch_competitors()
        _update_job(job_id, brief=brief)
    except Exception as e:
        _update_job(job_id, phase="error", error=f"SEO brief failed: {e}")
        return

    # Combine PAA + AI fanout queries
    paa_questions = (serp_data.get("paa_questions") or []) + (serp_data.get("ai_fanout_queries") or [])

    client = get_client()

    # -- STEP 2: Research Analysis --
    _update_job(job_id, phase="research")
    research = None
    try:
        research_system, research_user = build_research_prompt(
            keyword=keyword, city=city, state=state,
            brief=brief, serp_data=serp_data,
            competitors=competitors_scraped,
            paa_questions=paa_questions,
        )
        research_response = await client.messages.create(
            model=MODELS["haiku"],
            max_tokens=4000, temperature=0.2,
            system=research_system,
            messages=[{"role": "user", "content": research_user}],
            output_config={"format": {"type": "json_schema", "schema": RESEARCH_SCHEMA}},
        )
        raw_research = "".join(b.text for b in research_response.content if hasattr(b, "text"))
        research = extract_json(raw_research)
        _update_job(job_id, research=research)
    except Exception as e:
        logger.warning("Research analysis failed (continuing without): %s", e)

    # -- STEP 3: Outline --
    _update_job(job_id, phase="outline")
    try:
        system, user = build_outline_prompt(
            keyword=keyword, city=city, state=state,
            brief=brief, template=template_content,
            paa=paa_questions,
            competitors=competitors_scraped,
            research=research,
        )
        response = await client.messages.create(
            model=MODELS["sonnet"],
            max_tokens=4000, temperature=0.3,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"format": {"type": "json_schema", "schema": OUTLINE_SCHEMA}},
        )
        raw = "".join(b.text for b in response.content if hasattr(b, "text"))
        outline = extract_json(raw)

        # Persist phase-1 context onto the job row so it survives the
        # outline-approval pause (server restart safe). Parked inside the
        # brief jsonb column; stripped back out on resume.
        pause_ctx = {
            "competitors": [
                {
                    "title": c.get("title", ""),
                    "url": c.get("url", ""),
                    "content": (c.get("content") or "")[:2500],
                    "headings": (c.get("headings") or [])[:10],
                }
                for c in (competitors_scraped or [])[:3]
            ],
            "paa_questions": (paa_questions or [])[:12],
            "feedback": feedback,
            "competitor_urls": competitor_urls,
        }
        brief_with_ctx = dict(brief)
        brief_with_ctx[PIPELINE_CONTEXT_KEY] = pause_ctx
        _update_job(job_id, outline=outline, brief=brief_with_ctx, phase="outline_review")
        # PAUSE: wait for user approval before continuing
        return
    except Exception as e:
        logger.warning("Outline generation failed, continuing without: %s", e)
        outline = None
        # If outline fails, skip review and go to generate
    # Fall through to generate if outline failed (no return above)
    await _run_pipeline_phase2(
        job_id, keyword, city, state, brand_id, location_id,
        content_type, outline, brief, brand_data, style_examples,
        template_content, local_context,
        competitors=competitors_scraped, feedback=feedback,
        research=research, paa_questions=paa_questions,
    )


async def _run_pipeline_phase2(
    job_id: str, keyword: str, city: str, state: str,
    brand_id: str, location_id: str | None,
    content_type: str, outline: dict | None, brief: dict,
    brand_data: dict, style_examples: list,
    template_content: dict | None, local_context: dict | None,
    competitors: list | None = None,
    feedback: str | None = None,
    research: dict | None = None,
    paa_questions: list | None = None,
):
    """Phase 2: generate, critique, score, revise, save. Called after outline approval."""
    from app.services.pop import score_content_from_brief
    from app.services.claude import (
        get_client, MODELS, extract_json, get_generation_model,
    )
    from app.services.content_generator import (
        build_system_prompt, build_user_prompt, build_revision_prompts,
        build_critique_user_prompt, build_editorial_revision_user_prompt,
        with_role_block, CRITIQUE_ROLE, EDITORIAL_REVISION_ROLE,
        LEARNINGS_SCHEMA,
    )

    db = get_db()
    client = get_client()
    generation_model = get_generation_model()

    _update_job(job_id, phase="generating")
    try:
        # Resolve brand content template for this content type
        brand_templates = brand_data.get("content_templates") or {}
        brand_template = brand_templates.get(content_type) or ""

        # City-level enrichment for the target page city. Franchise-level fields
        # on the location (team_lead, certifications, reviews, etc.) override.
        from app.services.location_enrich import enrich_for_city, merge_with_franchise_context
        try:
            city_enrichment = await enrich_for_city(
                city=city, state=state,
                brand_name=brand_data.get("name") or "",
                services=brand_data.get("services") or [],
            )
        except Exception as e:
            logger.warning("city enrichment failed (continuing without): %s", e)
            city_enrichment = {}
        local_context = merge_with_franchise_context(city_enrichment, local_context)

        # Combine brand guidelines with user feedback
        guidelines = brand_data.get("brand_guidelines") or ""
        if feedback:
            guidelines = f"{guidelines}\n\nUSER FEEDBACK (apply to this generation):\n{feedback}" if guidelines else f"USER FEEDBACK (apply to this generation):\n{feedback}"

        # Per-brand stable system blocks (cached prefix shared by the
        # generation, critique, and revision calls below).
        system_blocks = build_system_prompt(
            template=template_content,
            style_examples=style_examples,
            services=brand_data.get("services") or [],
            voice_dimensions=brand_data.get("voice_dimensions"),
            voice_notes=brand_data.get("voice_notes"),
            brand_banned_words=brand_data.get("brand_banned_words"),
            brand_guidelines=guidelines,
            brand_competitors=brand_data.get("competitors") or [],
            prompt_learnings=brand_data.get("prompt_learnings"),
        )
        logger.info(
            "generate.prompt_inputs job=%s brand=%s content_type=%s model=%s "
            "brand_template_len=%d outline_present=%s competitors=%d "
            "paa=%d style_examples=%d brand_name=%r",
            job_id, brand_id, content_type, generation_model,
            len(brand_template or ""), bool(outline), len(competitors or []),
            len(paa_questions or []), len(style_examples or []),
            brand_data.get("name") or "",
        )
        user_prompt = build_user_prompt(
            keyword=keyword, city=city, state=state,
            brief=brief, template=template_content, outline=outline,
            competitors=competitors or [],
            paa_questions=paa_questions or [],
            local_context=local_context,
            content_type=content_type,
            research=research,
            brand_template=brand_template,
            brand_name=brand_data.get("name") or "",
        )

        full_text = ""
        usage = {"input_tokens": 0, "output_tokens": 0}

        def _add_usage(msg_usage):
            if msg_usage:
                usage["input_tokens"] += msg_usage.input_tokens or 0
                usage["output_tokens"] += msg_usage.output_tokens or 0

        async with client.messages.stream(
            model=generation_model,
            max_tokens=12000, temperature=0.4,
            system=system_blocks,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            async for event in stream:
                if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                    full_text += event.delta.text

            msg = await stream.get_final_message()
            if msg:
                _add_usage(msg.usage)

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

    # -- STEP 3.5: Editorial critique + revise (one critique call, one
    # revision call), BEFORE the term-count revision. Reuses the cached
    # brand system prefix so the batch shares cache entries. --
    try:
        _update_job(job_id, phase="revising")
        critique_user = build_critique_user_prompt(
            content=full_text, keyword=keyword, city=city, state=state,
            outline=outline, brand_template=brand_template,
            local_context=local_context,
        )
        critique_response = await client.messages.create(
            model=generation_model,
            max_tokens=1500, temperature=0.2,
            system=with_role_block(system_blocks, CRITIQUE_ROLE),
            messages=[{"role": "user", "content": critique_user}],
        )
        if critique_response.usage:
            usage["input_tokens"] += critique_response.usage.input_tokens or 0
            usage["output_tokens"] += critique_response.usage.output_tokens or 0
        critique_text = "".join(
            b.text for b in critique_response.content if hasattr(b, "text")
        ).strip()

        if critique_text and "NO EDITS NEEDED" not in critique_text.upper():
            edited_text = ""
            async with client.messages.stream(
                model=generation_model,
                max_tokens=12000, temperature=0.4,
                system=with_role_block(system_blocks, EDITORIAL_REVISION_ROLE),
                messages=[{"role": "user", "content": build_editorial_revision_user_prompt(full_text, critique_text)}],
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                        edited_text += event.delta.text
                msg = await stream.get_final_message()
                if msg and msg.usage:
                    usage["input_tokens"] += msg.usage.input_tokens or 0
                    usage["output_tokens"] += msg.usage.output_tokens or 0

            edited_text = edited_text.replace("\u2014", "-").replace("\u2013", "-").strip()
            # Sanity check: don't accept a collapsed/truncated rewrite.
            if edited_text and len(edited_text) >= len(full_text) * 0.5:
                full_text = edited_text
                word_count = len(full_text.split())

        _update_job(
            job_id, content=full_text, word_count=word_count,
            input_tokens=usage["input_tokens"],
            output_tokens=usage["output_tokens"],
        )
    except Exception as e:
        logger.warning("Editorial critique pass failed (keeping draft): %s", e)

    # -- STEP 4: Score against brief (local, instant) --
    _update_job(job_id, phase="scoring")
    try:
        score_result = score_content_from_brief(content=full_text, brief=brief)
        _update_job(job_id, score=score_result)
    except Exception as e:
        logger.warning("Scoring failed: %s", e)
        score_result = None

    # -- STEP 5: Term-count revision: AT MOST ONCE, after the editorial pass --
    revision_count = 0
    if score_result and score_result.get("overall_score", 100) < 75:
        _update_job(job_id, phase="revising", revision_count=revision_count + 1)
        try:
            system_rev, user_rev = build_revision_prompts(
                content=full_text, keyword=keyword,
                brief=brief, pop_feedback=score_result,
            )
            revised_text = ""
            async with client.messages.stream(
                model=generation_model,
                max_tokens=12000, temperature=0.4,
                system=with_role_block(system_blocks, system_rev),
                messages=[{"role": "user", "content": user_rev}],
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                        revised_text += event.delta.text
                msg = await stream.get_final_message()
                if msg and msg.usage:
                    usage["input_tokens"] += msg.usage.input_tokens or 0
                    usage["output_tokens"] += msg.usage.output_tokens or 0

            revised_text = revised_text.replace("\u2014", "-").replace("\u2013", "-")
            if revised_text.strip():
                full_text = revised_text
                word_count = len(full_text.split())
                revision_count += 1

                _update_job(
                    job_id, content=full_text, word_count=word_count,
                    revision_count=revision_count,
                    input_tokens=usage["input_tokens"],
                    output_tokens=usage["output_tokens"],
                )

                # Re-score against brief (local, instant)
                _update_job(job_id, phase="scoring")
                score_result = score_content_from_brief(content=full_text, brief=brief)
                _update_job(job_id, score=score_result)
        except Exception as e:
            logger.warning("Term revision failed: %s", e)

    # -- Save to generations FIRST, then mark done. If the save fails the
    # job must surface an error instead of showing Done with nothing saved. --
    gen_data = {
        "brand_id": brand_id,
        "keyword": keyword,
        "city": city,
        "content": full_text,
        "content_type": content_type,
        "model": generation_model,
        "word_count": word_count,
        "input_tokens": usage.get("input_tokens", 0) if usage else 0,
        "output_tokens": usage.get("output_tokens", 0) if usage else 0,
        "revision_count": revision_count,
    }
    if location_id:
        gen_data["location_id"] = location_id
    if outline:
        gen_data["outline"] = json.dumps(outline)
    if template_content and isinstance(template_content, dict):
        gen_data["template_name"] = template_content.get("name", "")
    if brief:
        gen_data["pop_brief"] = brief
    if score_result:
        gen_data["pop_score"] = score_result
    try:
        db.table("generations").insert(gen_data).execute()
    except Exception as e:
        logger.error("Failed to save generation for job %s: %s", job_id, e)
        _update_job(
            job_id, phase="error",
            error=f"Content was generated but could not be saved: {e}",
        )
        return

    _update_job(job_id, phase="done")

    # Update location's last_refresh_at
    if location_id:
        try:
            db.table("locations").update({
                "last_refresh_at": "now()",
                "status": "live",
            }).eq("id", location_id).execute()
        except Exception:
            pass

    # -- Post-generation: extract learnings for the brand --
    try:
        from app.services.content_generator import build_learning_prompt
        learn_system, learn_user = build_learning_prompt(
            keyword=keyword, city=city,
            score=score_result, revision_count=revision_count,
            word_count=word_count, brief=brief, feedback=feedback,
        )
        learn_response = await client.messages.create(
            model=MODELS["haiku"],
            max_tokens=1000, temperature=0.1,
            system=learn_system,
            messages=[{"role": "user", "content": learn_user}],
            output_config={"format": {"type": "json_schema", "schema": LEARNINGS_SCHEMA}},
        )
        raw_learn = "".join(b.text for b in learn_response.content if hasattr(b, "text"))
        parsed_learn = extract_json(raw_learn)
        if isinstance(parsed_learn, dict):
            new_learnings = parsed_learn.get("learnings") or []
        else:
            new_learnings = parsed_learn  # tolerate a bare array
        if isinstance(new_learnings, list) and new_learnings:
            # Load existing learnings, append new ones, cap at 20
            try:
                brand_row = db.table("brands").select("prompt_learnings").eq("id", brand_id).single().execute()
                existing = (brand_row.data or {}).get("prompt_learnings") or []
            except Exception:
                existing = []
            combined = existing + new_learnings
            # Keep most recent 20
            combined = combined[-20:]
            db.table("brands").update({"prompt_learnings": combined}).eq("id", brand_id).execute()
            logger.info("Stored %d new learnings for brand %s", len(new_learnings), brand_id)
    except Exception as e:
        logger.warning("Learning extraction failed (non-critical): %s", e)
