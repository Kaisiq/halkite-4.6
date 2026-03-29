from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from typing import Any

logger = logging.getLogger(__name__)

_DEFAULT_MODELS = (
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
)


def configured_models(primary: str | None = None) -> list[str]:
    raw = os.environ.get("GEMINI_MODEL_FALLBACKS", "")
    configured = [model.strip() for model in raw.split(",") if model.strip()]

    models: list[str] = []
    for candidate in ([primary] if primary else []) + configured + list(_DEFAULT_MODELS):
        if candidate and candidate not in models:
            models.append(candidate)
    return models


def _is_resource_exhausted(exc: Exception) -> bool:
    status = getattr(exc, "status_code", None)
    if status == 429:
        return True

    code = getattr(exc, "code", None)
    if isinstance(code, int) and code == 429:
        return True
    if isinstance(code, str) and "RESOURCE_EXHAUSTED" in code.upper():
        return True

    message = str(exc).upper()
    return "RESOURCE_EXHAUSTED" in message or "429" in message


async def generate_content_with_fallback(
    client: Any,
    *,
    primary_model: str,
    contents: Any,
    config: Any,
) -> Any:
    last_exc: Exception | None = None

    for model in configured_models(primary_model):
        try:
            if model != primary_model:
                logger.warning(
                    "Falling back to Gemini model %s after rate limit on %s",
                    model,
                    primary_model,
                )
            return await client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
        except Exception as exc:
            last_exc = exc
            if _is_resource_exhausted(exc):
                logger.warning("Gemini model %s exhausted: %s", model, exc)
                continue
            raise

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("No Gemini models configured")


async def generate_content_stream_with_fallback(
    client: Any,
    *,
    primary_model: str,
    contents: Any,
    config: Any,
) -> AsyncIterator[Any]:
    last_exc: Exception | None = None

    for model in configured_models(primary_model):
        try:
            if model != primary_model:
                logger.warning(
                    "Falling back to Gemini streaming model %s after rate limit on %s",
                    model,
                    primary_model,
                )
            async for chunk in client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
                config=config,
            ):
                yield chunk
            return
        except Exception as exc:
            last_exc = exc
            if _is_resource_exhausted(exc):
                logger.warning("Gemini streaming model %s exhausted: %s", model, exc)
                continue
            raise

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("No Gemini models configured")
