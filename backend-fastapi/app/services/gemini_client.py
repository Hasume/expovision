from __future__ import annotations

import json
import logging
from typing import Any, TypedDict

from app.core.config import settings

logger = logging.getLogger(__name__)


class CuratorFeedbackJson(TypedDict):
    """Structured JSON for POST /homework/curator/suggest-feedback."""

    feedback: str


class GeminiServiceError(RuntimeError):
    """Raised when Gemini integration cannot produce a valid result."""


def _strip_json_fences(payload: str) -> str:
    trimmed = payload.strip()
    if trimmed.startswith("```"):
        lines = trimmed.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return trimmed


def _extract_json_object(payload: str) -> dict[str, Any]:
    raw = _strip_json_fences(payload)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise GeminiServiceError("Gemini returned non-JSON response")
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError as exc:
        raise GeminiServiceError("Gemini returned invalid JSON payload") from exc
    if not isinstance(parsed, dict):
        raise GeminiServiceError("Gemini JSON payload must be an object")
    return parsed


class GeminiClient:
    def __init__(self) -> None:
        self._client = None

    @property
    def enabled(self) -> bool:
        return bool(settings.google_api_key)

    def _get_client(self):
        if not settings.google_api_key:
            raise GeminiServiceError("Gemini API key is not configured")
        if self._client is not None:
            return self._client
        try:
            from google import genai
        except ImportError as exc:
            raise GeminiServiceError("google-genai package is not installed") from exc
        self._client = genai.Client(api_key=settings.google_api_key)
        return self._client

    def generate_text(self, prompt: str, *, temperature: float = 0.6, max_tokens: int = 1024) -> str:
        """Generate plain text (not JSON-constrained) from a prompt."""
        client = self._get_client()
        try:
            from google.genai import types
        except ImportError as exc:
            raise GeminiServiceError("google-genai package is not installed") from exc

        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        try:
            response = client.models.generate_content(
                model=settings.google_gemini_model,
                contents=prompt,
                config=config,
            )
        except Exception as exc:
            raise GeminiServiceError("Gemini request failed") from exc

        text_value = getattr(response, "text", None)
        if not text_value:
            raise GeminiServiceError("Gemini returned empty text")
        return text_value.strip()

    def generate_json(self, prompt: str) -> dict[str, Any]:
        client = self._get_client()
        try:
            response = client.models.generate_content(
                model=settings.google_gemini_model,
                contents=prompt,
            )
        except Exception as exc:  # noqa: BLE001
            raise GeminiServiceError("Gemini request failed") from exc

        text_value = getattr(response, "text", None)
        if not text_value:
            raise GeminiServiceError("Gemini returned empty text")
        return _extract_json_object(text_value)

    def generate_curator_feedback_json(self, *, prompt: str) -> dict[str, Any]:
        """Curator homework feedback: enforced JSON schema (robust vs. braces/quotes in student text)."""
        client = self._get_client()
        try:
            from google.genai import types
        except ImportError as exc:
            raise GeminiServiceError("google-genai package is not installed") from exc

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=CuratorFeedbackJson,
            temperature=0.55,
            max_output_tokens=8192,
        )
        try:
            response = client.models.generate_content(
                model=settings.google_gemini_model,
                contents=prompt,
                config=config,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini curator feedback request failed: %s", exc, exc_info=True)
            raise GeminiServiceError("Gemini request failed") from exc

        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, dict) and str(parsed.get("feedback", "")).strip():
            return parsed

        text_value = getattr(response, "text", None)
        if text_value:
            try:
                return _extract_json_object(text_value)
            except GeminiServiceError as exc:
                logger.warning("Gemini curator feedback parse failed: %s", exc, exc_info=True)
                raise

        finish = getattr(response, "candidates", None)
        logger.warning(
            "Gemini curator feedback empty text; candidates=%s",
            finish,
        )
        raise GeminiServiceError("Gemini returned empty text")


gemini_client = GeminiClient()
