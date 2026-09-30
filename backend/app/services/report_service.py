"""Report service — generates Markdown and PDF reports from real analysis results.

The report contains only actual values: query, image info, analysis type,
detections, statistics, confidence (when produced by a model), visual
evidence URLs, the AI explanation and limitations.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from app.core.config import settings
from app.core.errors import AppError, NotFoundError, ValidationError
from app.core.logging_config import get_logger
from app.models.analysis import Analysis
from app.models.imagery import Imagery
from app.models.query import Query
from app.models.report import Report

logger = get_logger(__name__)


def generate_report(db, analysis_id: str, fmt: str = "pdf") -> Report:
    if fmt not in ("pdf", "markdown"):
        raise ValidationError("format must be 'pdf' or 'markdown'", code="invalid_format")

    analysis = db.get(Analysis, analysis_id)
    if analysis is None:
        raise NotFoundError(f"Analysis '{analysis_id}' not found", code="analysis_not_found")
    if analysis.status != "completed" or not analysis.result:
        raise ValidationError(
            f"Analysis is '{analysis.status}'; reports require a completed analysis.",
            code="analysis_not_completed",
        )

    result = analysis.result
    imagery = db.get(Imagery, analysis.imagery_id) if analysis.imagery_id else None
    ref_imagery = db.get(Imagery, analysis.reference_imagery_id) if analysis.reference_imagery_id else None
    query = db.get(Query, analysis.query_id) if analysis.query_id else None

    md = _build_markdown(analysis, result, imagery, ref_imagery, query)

    settings.reports_dir.mkdir(parents=True, exist_ok=True)
    if fmt == "markdown":
        path = settings.reports_dir / f"report-{analysis_id}-{uuid.uuid4().hex[:8]}.md"
        path.write_text(md, encoding="utf-8")
    else:
        path = settings.reports_dir / f"report-{analysis_id}-{uuid.uuid4().hex[:8]}.pdf"
        _markdown_to_pdf(md, str(path))

    record = Report(
        analysis_id=analysis.id,
        query_id=analysis.query_id,
        format=fmt,
        path=str(path),
        title=f"{analysis.analysis_type} report",
        status="completed",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info("Report %s generated for analysis %s (%s)", record.id, analysis_id, fmt)
    return record


def _build_markdown(analysis: Analysis, result: dict, imagery: Imagery | None, ref_imagery: Imagery | None, query: Query | None) -> str:
    lines: list[str] = []
    lines.append("# SatQuery AI — Analysis Report")
    lines.append("")
    lines.append(f"- **Analysis ID:** `{analysis.id}`")
    lines.append(f"- **Task:** {analysis.analysis_type}")
    lines.append(f"- **Method:** {result.get('method') or 'n/a'}")
    lines.append(f"- **Status:** {analysis.status} (progress {analysis.progress}%)")
    lines.append(f"- **Generated:** {datetime.now(timezone.utc).isoformat()}")
    lines.append("")

    if query is not None:
        lines.append("## Query")
        lines.append("")
        lines.append(f"> {query.query_text}")
        lines.append("")
        if query.detected_location:
            lines.append(f"- **Location:** {query.detected_location}")
        if analysis.parameters:
            lines.append(f"- **Plan:** `{json.dumps(analysis.parameters.get('plan') or {}, ensure_ascii=False)}`")
        lines.append("")

    lines.append("## Image information")
    lines.append("")
    for label, img in (("Image", imagery), ("Reference image", ref_imagery)):
        if img is None:
            continue
        lines.append(f"### {label}")
        lines.append(f"- Filename: `{img.original_filename}`")
        lines.append(f"- Size: {img.width} x {img.height} px, {img.bands} band(s)")
        lines.append(f"- Georeferenced: {img.is_georeferenced}")
        if img.crs:
            lines.append(f"- CRS: `{img.crs}`")
        if img.bounds:
            lines.append(f"- Bounds: {[round(b, 4) for b in img.bounds]}")
        if img.center:
            lines.append(f"- Center (WGS84): {img.center}")
        lines.append("")

    lines.append("## Analysis result")
    lines.append("")
    lines.append(result.get("summary") or "")
    lines.append("")

    detections = result.get("detections") or []
    lines.append(f"### Detections ({len(detections)})")
    lines.append("")
    if detections:
        lines.append("| # | Feature | Area (m²) | Area (px) | Confidence |")
        lines.append("|---|---------|-----------|-----------|------------|")
        for i, d in enumerate(detections, 1):
            lines.append(
                f"| {i} | {d.get('feature', '?')} | {d.get('area_m2') if d.get('area_m2') is not None else '—'} | "
                f"{d.get('area_px') if d.get('area_px') is not None else '—'} | "
                f"{d.get('confidence') if d.get('confidence') is not None else '—'} |"
            )
    else:
        lines.append("No detections.")
    lines.append("")

    stats = result.get("statistics") or {}
    if stats:
        lines.append("### Statistics")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(stats, indent=2, default=str))
        lines.append("```")
        lines.append("")

    conf = result.get("confidence")
    if conf is not None:
        lines.append(f"- **Confidence:** {conf}")
        lines.append("")

    ve = result.get("visual_evidence") or {}
    if any(ve.values()):
        lines.append("## Visual evidence")
        lines.append("")
        for key, url in ve.items():
            if url:
                lines.append(f"- **{key}:** `{url}`")
        lines.append("")

    limitations = result.get("limitations") or []
    if limitations:
        lines.append("## Limitations")
        lines.append("")
        for lim in limitations:
            lines.append(f"- {lim}")
        lines.append("")

    return "\n".join(lines)


def _markdown_to_pdf(md: str, out_path: str) -> None:
    """Render markdown to a basic PDF via reportlab."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=16, spaceAfter=10, textColor=colors.HexColor("#1a1a2e"))
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, spaceBefore=12, spaceAfter=6, textColor=colors.HexColor("#1a1a2e"))
    h3 = ParagraphStyle("H3", parent=styles["Heading3"], fontSize=11, spaceBefore=8, spaceAfter=4, textColor=colors.HexColor("#333"))
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=9.5, leading=13)

    doc = SimpleDocTemplate(out_path, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm)
    story: list = []
    for line in md.splitlines():
        line = line.rstrip()
        if not line:
            story.append(Spacer(1, 4))
        elif line.startswith("# "):
            story.append(Paragraph(_esc(line[2:]), h1))
        elif line.startswith("## "):
            story.append(Paragraph(_esc(line[3:]), h2))
        elif line.startswith("### "):
            story.append(Paragraph(_esc(line[4:]), h3))
        elif line.startswith("> "):
            story.append(Paragraph(_esc(line[2:]), body))
        elif line.startswith("- "):
            story.append(Paragraph("• " + _esc(line[2:]), body))
        else:
            story.append(Paragraph(_esc(line), body))
    doc.build(story)


def _esc(text: str) -> str:
    from html import escape

    return escape(text).replace("|", "&#124;")