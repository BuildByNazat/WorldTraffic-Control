"""
Gemini Vision Client — WorldTraffic Control

Sends a camera image to the Gemini API and returns a raw JSON string
containing detected objects.

Design Principles:
  - Narrow scope: calls the API, returns text. All validation is in detections.py.
  - The google-genai SDK's `client.models.generate_content()` is synchronous.
    It is run in a thread pool via asyncio.to_thread() to avoid blocking the
    FastAPI event loop during the (potentially slow) network call.
  - All errors return None. Callers treat None as "no detections available".

Usage:
    from app.services.vision.gemini_client import analyse_image_bytes
    raw_json = await analyse_image_bytes(image_bytes, mime_type="image/jpeg")

Requirements:
  - GEMINI_API_KEY must be set in environment.
  - google-genai >= 1.0.0 must be installed.

Limitations:
  - Coordinates attached to detections are the camera's own lat/lon — NOT
    precise geolocation derived from image content. This is an MVP approximation.
"""

import asyncio
import logging
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

_DETECTION_PROMPT = """\
You are an expert traffic and infrastructure analyst reviewing a camera image.

Analyse this image and return ONLY a JSON object — no markdown, no prose, no explanation.

The JSON must follow this exact structure:
{
  "detections": [
    {
      "label": "string — short human-readable label, e.g. 'Blue sedan', 'Stopped truck'",
      "category": "vehicle | pedestrian | aircraft | infrastructure | incident | unknown",
      "confidence": 0.0 to 1.0
    }
  ]
}

Rules:
- Return an empty detections array if nothing notable is visible.
- Do not include coordinates — those are handled separately.
- Do not return more than 10 detections.
- Do not return markdown code fences, only raw JSON.
- Categories must be one of: vehicle, pedestrian, aircraft, infrastructure, incident, unknown.
"""


# ---------------------------------------------------------------------------
# Internal synchronous call (runs in thread pool)
# ---------------------------------------------------------------------------

def _call_gemini_sync(image_bytes: bytes, mime_type: str) -> Optional[str]:
    """
    Synchronous Gemini API call, intended to be called via asyncio.to_thread().

    The google-genai SDK currently provides a synchronous client only.
    Running it in a thread pool isolates the blocking I/O from the event loop.

    Returns the stripped JSON string, or None on any failure.
    """
    try:
        from google import genai  # lazy import — app starts without this package
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)

        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        text_part = types.Part.from_text(text=_DETECTION_PROMPT)

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[types.Content(parts=[image_part, text_part])],
        )

        raw = response.text
        if not raw:
            logger.warning("Gemini returned an empty response.")
            return None

        # Strip markdown fences in case the model disobeyed the prompt
        raw = raw.strip()
        if raw.startswith("```"):
            lines = raw.splitlines()
            # Remove opening fence (and optional language tag) + closing fence
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        logger.debug("Gemini raw response (%d chars): %s…", len(raw), raw[:120])
        return raw

    except ImportError:
        logger.error(
            "google-genai package is not installed. "
            "Run: pip install google-genai>=1.0.0"
        )
        return None
    except Exception:
        logger.exception("Gemini API call failed — skipping detections for this cycle.")
        return None


# ---------------------------------------------------------------------------
# Public async interface
# ---------------------------------------------------------------------------

async def analyse_image_bytes(
    image_bytes: bytes,
    mime_type: str = "image/jpeg",
) -> Optional[str]:
    """
    Send `image_bytes` to Gemini for object detection analysis.

    Runs the synchronous SDK call in a thread pool so it does not block
    the FastAPI event loop.

    Returns the raw JSON string, or None if:
      - GEMINI_API_KEY is not set
      - The API call or response parsing fails for any reason

    Callers should treat None as "no detections available — continue normally".
    """
    if not settings.gemini_api_key:
        logger.debug("GEMINI_API_KEY not set — skipping vision analysis.")
        return None

    if not image_bytes:
        logger.debug("Empty image bytes — skipping vision analysis.")
        return None

    # Offload the synchronous SDK call to a thread to keep the event loop free
    return await asyncio.to_thread(_call_gemini_sync, image_bytes, mime_type)
