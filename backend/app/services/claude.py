"""Claude API client with SSE streaming."""
from __future__ import annotations
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


async def stream_claude(
    system_prompt: str,
    user_prompt: str,
    model: str = "sonnet",
) -> AsyncGenerator[str, None]:
    """Stream Claude response as SSE events.

    Yields strings in format: 'data: {"type": "chunk"|"done"|"error", ...}\n\n'
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
        logger.error("Claude stream error: %s", e)
        if full_text:
            pass  # Return partial content below
        else:
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
            return

    # Strip em dashes
    full_text = full_text.replace("\u2014", "-").replace("\u2013", "-")
    word_count = len(full_text.split())

    yield f'data: {json.dumps({"type": "done", "content": full_text, "word_count": word_count, "usage": usage})}\n\n'


async def call_claude(
    system_prompt: str,
    user_prompt: str,
    model: str = "sonnet",
    max_tokens: int = 4000,
    temperature: float = 0.3,
) -> str:
    """Non-streaming Claude call (for outlines)."""
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    model_id = MODELS.get(model, MODELS["sonnet"])
    response = await client.messages.create(
        model=model_id,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    return raw.replace("\u2014", "-").replace("\u2013", "-")
