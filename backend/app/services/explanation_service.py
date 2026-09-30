"""AI explanation service.

The LLM (when configured) only explains REAL structured analysis output.
It is never allowed to invent detections, numbers or statistics: the prompt
explicitly forbids it and the factual summary is always available as a
fallback built only from measured values.
"""

from __future__ import annotations

import json

import httpx

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

_SYSTEM = (
    "You are a scientific assistant explaining remote-sensing analysis results. "
    "You receive the STRUCTURED OUTPUT of a real analysis pipeline (detections, "
    "statistics, method, limitations). Explain what was found in simple, plain "
    "language for a non-expert user. CRITICAL RULES: never invent detections, "
    "counts, areas, dates or confidence scores; only reference values that are "
    "actually present in the JSON; if something is unknown or was not measured, "
    "say so explicitly. Keep it under 150 words."
)


def factual_summary(result: dict) -> str:
    """Build a summary strictly from measured values in the result."""
    parts: list[str] = []
    task = result.get("task", "analysis")
    detections = result.get("detections", [])
    stats = result.get("statistics", {}) or {}

    if task == "change_detection":
        pct = stats.get("changed_percent")
        regions = stats.get("num_regions")
        if regions is not None and pct is not None:
            parts.append(f"Detected {regions} changed region(s) covering {pct}% of the compared area.")
        else:
            parts.append("The comparison completed; see statistics for measured differences.")
    else:
        count = len(detections)
        if count:
            label = detections[0].get("feature", task.replace("_", " "))
            parts.append(f"Detected {count} {label} region(s) in the image.")
        else:
            parts.append("No regions of the requested feature were detected.")

    cov = stats.get("coverage_percent")
    if cov is not None:
        parts.append(f"The feature covers {cov}% of the image.")

    area = stats.get("total_area_m2")
    if area is not None:
        unit = "m²" if area < 1_000_000 else "km²"
        value = area if area < 1_000_000 else area / 1_000_000
        parts.append(f"Total measured area: {value:,.2f} {unit}.")

    method = result.get("method")
    if method:
        parts.append(f"Method: {method}.")

    limitations = result.get("limitations", [])
    if limitations:
        parts.append("Limitations: " + " ".join(limitations[:3]))

    return " ".join(parts) if parts else "Analysis completed; see result details."


def explain(result: dict) -> str:
    """Return an LLM explanation when configured, else the factual summary."""
    if settings.llm_configured:
        try:
            text = _call_llm(result)
            if text:
                return text
        except Exception as exc:  # noqa: BLE001
            logger.warning("LLM explanation failed, using factual summary: %s", exc)
    return factual_summary(result)


def _call_llm(result: dict) -> str | None:
    payload = {
        "task": result.get("task"),
        "method": result.get("method"),
        "summary_stats": result.get("statistics"),
        "detections": result.get("detections"),
        "confidence": result.get("confidence"),
        "limitations": result.get("limitations"),
    }
    user_msg = f"Here is the structured output of a real analysis:\n{json.dumps(payload)}\nExplain it."

    if settings.GEMINI_API_KEY:
        model = settings.LLM_MODEL
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}"
            f":generateContent?key={settings.GEMINI_API_KEY}"
        )
        body = {
            "contents": [{"parts": [{"text": _SYSTEM + "\n\n" + user_msg}]}],
            "generationConfig": {"maxOutputTokens": 400, "temperature": 0.2},
        }
        with httpx.Client(timeout=45) as client:
            resp = client.post(url, json=body)
            if resp.status_code == 200:
                data = resp.json()
                cands = data.get("candidates") or []
                if cands:
                    parts = cands[0].get("content", {}).get("parts") or []
                    if parts:
                        return parts[0].get("text", "").strip()

    if settings.OPENAI_API_KEY:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}
        body = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            "max_tokens": 400,
            "temperature": 0.2,
        }
        with httpx.Client(timeout=45) as client:
            resp = client.post(url, json=body, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return content.strip()

    return None