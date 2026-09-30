"""Query understanding service.

This is currently a deterministic mock that turns natural-language queries
into a structured plan (task, operation, dates, output). It is deliberately
simple so the backend works without an external LLM during development; the
architecture leaves a clear hook for wiring a real model later.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class QueryPlan:
    location: str | None = None
    task: str = "water_detection"
    operation: str = "single_date"
    date_1: str | None = None
    date_2: str | None = None
    output: list[str] = field(default_factory=lambda: ["map", "statistics", "explanation"])
    matched_keywords: list[str] = field(default_factory=list)
    raw_query: str = ""
    notes: dict[str, Any] = field(default_factory=dict)

    def model_dump(self) -> dict[str, Any]:
        return {
            "location": self.location,
            "task": self.task,
            "operation": self.operation,
            "date_1": self.date_1,
            "date_2": self.date_2,
            "output": self.output,
            "matched_keywords": self.matched_keywords,
            "raw_query": self.raw_query,
        }


_TASK_KEYWORDS: dict[str, str] = {
    "water": "water_detection",
    "vegetation": "vegetation_analysis",
    "crop": "vegetation_analysis",
    "agriculture": "agriculture",
    "agricultural": "agriculture",
    "land cover": "landcover",
    "landcover": "landcover",
    "building": "building_detection",
    "buildings": "building_detection",
    "count": "object_counting",
    "change": "change_detection",
    "built-up": "built_up_detection",
    "built up": "built_up_detection",
    "builtup": "built_up_detection",
    "urban": "built_up_detection",
}

_OPERATION_FROM_INTENT = {
    "compare": "change_detection",
    "comparison": "change_detection",
    "difference": "change_detection",
    "changed": "change_detection",
    "over time": "change_detection",
    "between": "change_detection",
}

# Words that indicate the query is not a geospatial analysis request.
_UNRECOGNIZED_MARKERS = (
    "weather", "temperature", "stock", "news", "recipe", "joke",
    "translate", "capital of", "population",
)

# Scaffolding words stripped before location extraction.
_SCAFFOLDING = re.compile(
    r"^(show|find|list|where|how many|count|detect|identify|compare|what|analyze|analyse|"
    r"highlight|map|give|tell)\s+",
    re.IGNORECASE,
)

_PREPOSITION_SPLIT = re.compile(r"\s+(in|on|at|near|around|between|and|from|of|since|during|over)\s+", re.IGNORECASE)


def parse_query(query: str) -> QueryPlan:
    """Parse a natural-language query into a structured analysis plan.

    Heuristic parser suitable for development/demo. Raises ValidationError
    when the query clearly is not a geospatial analysis request.
    """
    from app.core.errors import ValidationError

    text = (query or "").strip()
    lowered = text.lower()

    if not lowered:
        raise ValidationError("Query must not be empty", code="empty_query")

    for marker in _UNRECOGNIZED_MARKERS:
        if marker in lowered:
            raise ValidationError(
                f"Could not interpret '{text}' as a satellite-analysis query.",
                code="unrecognized_query",
            )

    matched: list[str] = []

    # ── Task hint ─────────────────────────────────────────────────
    plan = QueryPlan(raw_query=text)
    for keyword, task in _TASK_KEYWORDS.items():
        if keyword in lowered:
            plan.task = task
            matched.append(keyword)
            break

    # "Compare/contrast X and Y" style queries are change detection even when
    # a feature keyword (vegetation, water...) appears first.
    if re.search(r"\b(compare|contrast|difference between)\b", lowered):
        plan.task = "change_detection"
        plan.operation = "change_detection"
        if "compare" not in matched:
            matched.append("compare")

    # ── Operation hint (change detection) ─────────────────────────
    for keyword, operation in _OPERATION_FROM_INTENT.items():
        if keyword in lowered:
            plan.operation = operation
            matched.append(keyword)
            break

    # ── Two-date comparison: "between June 2025 and June 2026" ────
    between_match = re.search(
        r"between\s+(?P<d1>[a-z]+\s+\d{4})\s+(?:and|to)\s+(?P<d2>[a-z]+\s+\d{4})",
        lowered,
    )
    if between_match:
        plan.date_1 = normalize_month_year(between_match.group("d1"))
        plan.date_2 = normalize_month_year(between_match.group("d2"))
        if plan.operation != "change_detection":
            plan.operation = "change_detection"
            matched.append("between")

    # ── Single-date hint: "in June 2025", "from June 2025" ────────
    single_match = re.search(
        r"(?:in|from|around|since|during)\s+([a-z]+)\s+(\d{4})",
        lowered,
    )
    if single_match and not plan.date_1:
        plan.date_1 = normalize_month_year(f"{single_match.group(1)} {single_match.group(2)}")

    # If task was change_detection but the words "change/compare" appeared
    # explicitly, the task keyword already covered it.
    if plan.task == "change_detection" and plan.operation == "single_date":
        plan.operation = "change_detection"

    # ── Output hint ───────────────────────────────────────────────
    outputs: list[str] = []
    if "map" in lowered or "show" in lowered or "highlight" in lowered:
        outputs.append("map")
    if "statistics" in lowered or "numbers" in lowered or "percent" in lowered:
        outputs.append("statistics")
    if "report" in lowered:
        outputs.append("report")
    if "explain" in lowered or "why" in lowered:
        outputs.append("explanation")
    plan.output = outputs or ["map", "statistics", "explanation"]

    # ── Location hint ─────────────────────────────────────────────
    plan.location = _extract_location(text)
    plan.matched_keywords = matched
    plan.notes = {"query_raw": text, "parsed_locally": True}

    return plan


def _extract_location(text: str) -> str | None:
    """Tiny location hint extractor for the demo workflow.

    Looks for 'near/around/in <Place>' patterns. Real product would call a
    geocoder (Nominatim / Google Geocoding); this keeps the demo self-contained.
    """
    match = re.search(
        r"\b(?:near|around|in|at)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)",
        text,
    )
    if match:
        place = match.group(1).strip()
        # Avoid grabbing generic words that were only capitalized by accident
        if place.lower() not in {"this", "the", "image", "scene", "june", "july"} and place.lower() not in _MONTH_NAMES:
            return place
    return None


def normalize_month_year(token: str) -> str:
    """Normalize 'June 2025' style tokens into 'YYYY-MM' for storage/planning."""
    parts = token.strip().split()
    if len(parts) != 2:
        return token
    month_name, year = parts
    month_num = _month_to_num(month_name)
    if month_num is None:
        return f"{year}-{month_name.lower()}"
    return f"{year}-{month_num:02d}"


_MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def _month_to_num(month: str) -> int | None:
    return _MONTH_NAMES.get(month.lower())
