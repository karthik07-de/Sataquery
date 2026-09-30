"""Analysis endpoints: run + status polling."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.errors import ValidationError
from app.database.database import get_db
from app.schemas.analysis import AnalysisRunRequest, AnalysisRunResponse, AnalysisResult, AnalysisStatusResponse
from app.services import analysis_service, imagery_service

router = APIRouter(tags=["analysis"])


@router.post(
    "/analysis/run",
    response_model=AnalysisRunResponse,
    summary="Run an analysis on uploaded imagery",
    description=(
        "Queues a real analysis (water/vegetation/built-up/building/change detection). "
        "Processing runs asynchronously; poll GET /analysis/{id} for status."
    ),
)
async def run_analysis(body: AnalysisRunRequest, db: Session = Depends(get_db)):
    imagery_service.get_imagery_or_404(db, body.image_id)
    if body.reference_image_id:
        imagery_service.get_imagery_or_404(db, body.reference_image_id)
    if body.analysis_type == "change_detection" and not body.reference_image_id:
        raise ValidationError(
            "change_detection requires reference_image_id (the second image to compare).",
            code="missing_reference_image",
        )

    analysis = analysis_service.create_analysis(
        db,
        analysis_type=body.analysis_type,
        imagery_id=body.image_id,
        reference_imagery_id=body.reference_image_id,
        project_id=body.project_id,
        parameters=body.params,
    )
    analysis_service.schedule(analysis.id)
    return AnalysisRunResponse(analysis_id=analysis.id, task=analysis.task, status=analysis.status)


@router.get(
    "/analysis/{analysis_id}",
    response_model=AnalysisStatusResponse,
    summary="Get analysis status / result",
)
def analysis_status(analysis_id: str, db: Session = Depends(get_db)):
    record = analysis_service.get_status(db, analysis_id)

    def iso(dt: datetime | None) -> str | None:
        return dt.isoformat() if dt else None

    result = None
    if record.result is not None:
        try:
            result = AnalysisResult.model_validate(record.result)
        except Exception:  # noqa: BLE001 — never hide the raw result behind schema drift
            result = record.result

    return AnalysisStatusResponse(
        analysis_id=record.id,
        task=record.task,
        status=record.status,
        progress=record.progress,
        error_code=record.error_code,
        error_message=record.error_message,
        result=result,
        created_at=iso(record.created_at),
        started_at=iso(record.started_at),
        completed_at=iso(record.completed_at),
    )