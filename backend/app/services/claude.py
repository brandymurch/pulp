"""Claude API client with SSE streaming, shared client, and JSON helpers."""
from __future__ import annotations
import json
import logging
import os
import re
from typing import Any, AsyncGenerator, Union

import anthropic
from app.config import ANTHROPIC_API_KEY

logger = logging.getLogger(__name__)

MODELS = {
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-6",
    "haiku": "claude-haiku-4-5-20251001",
}

# system can be a plain string or a list of content blocks (for prompt caching).
SystemPrompt = Union[str, list]

_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    """Shared module-level AsyncAnthropic client (explicit timeout, retries)."""
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(
            api_key=ANTHROPIC_API_KEY,
            timeout=600.0,
            max_retries=3,
        )
    return _client


def resolve_model(model: str) -> str:
    """Resolve a MODELS key (or pass through a full model id) to a model id."""
    return MODELS.get(model, model if model.startswith("claude-") else MODELS["sonnet"])


def get_generation_model() -> str:
    """Model id for the main page-generation call.

    Env-overridable so the owner can flip e.g. GENERATION_MODEL=opus
    without a code change.
    """
    key = os.environ.get("GENERATION_MODEL", "sonnet")
    return resolve_model(key)


def extract_json(raw: str) -> Any:
    """Parse JSON from a model response that may include preamble or fences.

    Strategy: direct json.loads -> fenced ```json block -> first balanced
    {...} or [...] span. Raises ValueError if nothing parseable is found.
    """
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("empty response")

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Fenced code block (```json ... ``` or ``` ... ```)
    fence = re.search(r"```(?:json)?\s*\n(.*?)```", raw, re.DOTALL)
    if fence:
        try:
            return json.loads(fence.group(1).strip())
        except json.JSONDecodeError:
            pass

    # First balanced {...} or [...] span
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start = raw.find(open_ch)
        if start == -1:
            continue
        depth = 0
        in_str = False
        escape = False
        for i in range(start, len(raw)):
            ch = raw[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(raw[start:i + 1])
                    except json.JSONDecodeError:
                        break

    raise ValueError(f"could not extract JSON from response: {raw[:200]}")


async def stream_claude(
    system_prompt: SystemPrompt,
    user_prompt: str,
    model: str = "sonnet",
) -> AsyncGenerator[str, None]:
    """Stream Claude response as SSE events.

    Yields strings in format: 'data: {"type": "chunk"|"done"|"error", ...}\n\n'

    If the stream fails after partial text was received, a distinct
    {"type": "error", "partial": true, "content": <text so far>, ...} event
    is emitted instead of "done" so truncated pages are never treated as
    complete.
    """
    client = get_client()
    model_id = resolve_model(model)
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
        logger.error("Claude stream error (partial=%s): %s", bool(full_text), e)
        payload = {
            "type": "error",
            "partial": bool(full_text),
            "content": full_text,
            "message": str(e),
        }
        yield f"data: {json.dumps(payload)}\n\n"
        return

    # Strip em dashes
    full_text = full_text.replace("\u2014", "-").replace("\u2013", "-")
    word_count = len(full_text.split())

    yield f'data: {json.dumps({"type": "done", "content": full_text, "word_count": word_count, "usage": usage})}\n\n'


async def call_claude(
    system_prompt: SystemPrompt,
    user_prompt: str,
    model: str = "sonnet",
    max_tokens: int = 4000,
    temperature: float = 0.3,
    output_schema: dict | None = None,
) -> str:
    """Non-streaming Claude call (for outlines, research, etc.).

    When output_schema is provided, structured outputs
    (output_config.format json_schema) constrain the response to valid JSON.
    """
    client = get_client()
    model_id = resolve_model(model)
    kwargs: dict[str, Any] = {}
    if output_schema:
        kwargs["output_config"] = {
            "format": {"type": "json_schema", "schema": output_schema}
        }
    response = await client.messages.create(
        model=model_id,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        **kwargs,
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    return raw.replace("\u2014", "-").replace("\u2013", "-")
