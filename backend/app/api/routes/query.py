"""Query endpoint — parses natural language into a structured analysis plan."""

from __future__ import annotations

import json
from datetime import date

from fastapi import APIRouter, Depends, Query as FastAPIQuery
from sqlalchemy.orm import Session

from app.core.errors import ValidationError
from app.database.database import get_db
from app.models.query import Query
from app.schemas.query import QueryRequest, QueryResponse
from app.services import analysis_service, imagery_service, query_service

router = APIRouter(tags=["query"])


@router.post(
    "/query",
    response_model=QueryResponse,
    summary="Submit a natural-language analysis query",
    description=(
        "Parses the query into a structured plan (task, operation, dates, location), "
        "validates the referenced imagery, queues the analysis and returns its ID for "
        "status polling."
    ),
)
async def submit_query(
    body: QueryRequest,
    user_id: str | None = FastAPIQuery(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    plan = query_service.parse_query(body.query)

    if not body.image_id:
        raise ValidationError(
            "image_id is required to analyse an uploaded image. "
            "(Satellite acquisition from Copernicus is not yet wired to query submission.)",
            code="image_required",
        )
    imagery_service.get_imagery_or_404(db, body.image_id)

    analysis_type = plan.task
    reference_image_id = body.reference_image_id

    if plan.operation == "change_detection" or analysis_type == "change_detection":
        analysis_type = "change_detection"
        if not reference_image_id:
            raise ValidationError(
                "Change detection requires a second image: provide reference_image_id "
                "and upload both images first.",
                code="missing_reference_image",
            )
        imagery_service.get_imagery_or_404(db, reference_image_id)

    parsed_query = plan.model_dump()
    query_record = Query(
        user_id=user_id or getattr(body, "user_id", None) or "demo-user",
        project_id=body.project_id,
        query_text=body.query,
        detected_location=plan.location or body.location,
        detected_task=plan.task,
        operation=plan.operation,
        date_start=_month_to_date(plan.date_1),
        date_end=_month_to_date(plan.date_2),
        output_type=json.dumps(plan.output),
        parsed_query=parsed_query,
    )
    db.add(query_record)
    db.commit()
    db.refresh(query_record)

    analysis = analysis_service.create_analysis(
        db,
        analysis_type=analysis_type,
        imagery_id=body.image_id,
        reference_imagery_id=reference_image_id,
        project_id=body.project_id,
        query_id=query_record.id,
        parameters={"plan": parsed_query, "location": body.location, "date": body.date},
    )
    analysis_service.schedule(analysis.id)

    return QueryResponse(
        query_id=query_record.id,
        analysis_id=analysis.id,
        task=analysis_type,
        operation=plan.operation,
        status=analysis.status,
        plan=plan.model_dump(),
    )


def _month_to_date(value: str | None) -> date | None:
    """Convert 'YYYY-MM' (or 'YYYY-MM-DD') into a date; None when absent/invalid."""
    if not value:
        return None
    try:
        return date.fromisoformat(f"{value}-01"[:10])
    except ValueError:
        return None