"""Report endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.database.database import get_db
from app.models.report import Report
from app.schemas.report import ReportCreate, ReportResponse
from app.services import report_service

router = APIRouter(tags=["reports"])


@router.post(
    "/reports",
    response_model=ReportResponse,
    status_code=201,
    summary="Generate a report from a completed analysis",
)
def create_report(body: ReportCreate, db: Session = Depends(get_db)):
    record = report_service.generate_report(db, body.analysis_id, body.format)
    return _to_response(record)


@router.get("/reports/{report_id}", response_model=ReportResponse, summary="Get report metadata")
def get_report(report_id: str, db: Session = Depends(get_db)):
    record = db.get(Report, report_id)
    if record is None:
        raise NotFoundError(f"Report '{report_id}' not found", code="report_not_found")
    return _to_response(record)


@router.get("/reports/{report_id}/download", summary="Download the report file")
def download_report(report_id: str, db: Session = Depends(get_db)):
    record = db.get(Report, report_id)
    if record is None:
        raise NotFoundError(f"Report '{report_id}' not found", code="report_not_found")
    media_type = "application/pdf" if record.format == "pdf" else "text/markdown"
    return FileResponse(record.path, media_type=media_type, filename=f"satquery-report-{record.id}.{record.format}")


def _to_response(record: Report) -> ReportResponse:
    return ReportResponse(
        id=record.id,
        analysis_id=record.analysis_id,
        format=record.format,
        url=f"/reports/{record.id}/download",
        path=record.path,
        created_at=record.created_at,
    )