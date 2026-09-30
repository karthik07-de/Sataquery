"""Project CRUD endpoints — projects store analysis sessions."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, ValidationError
from app.database.database import get_db
from app.models.analysis import Analysis
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectListResponse, ProjectResponse, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


def _to_response(project: Project, analysis_count: int) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        analysis_count=analysis_count,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("", response_model=ProjectListResponse, summary="List projects")
def list_projects(db: Session = Depends(get_db)):
    rows = db.execute(
        select(Project, func.count(Analysis.id))
        .outerjoin(Analysis, Analysis.project_id == Project.id)
        .group_by(Project.id)
        .order_by(Project.updated_at.desc())
    ).all()
    projects = [_to_response(p, c or 0) for p, c in rows]
    return ProjectListResponse(projects=projects, total=len(projects))


@router.post("", response_model=ProjectResponse, status_code=201, summary="Create a project")
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(name=body.name, description=body.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return _to_response(project, 0)


@router.get("/{project_id}", response_model=ProjectResponse, summary="Get a project")
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError(f"Project '{project_id}' not found", code="project_not_found")
    count = db.scalar(select(func.count(Analysis.id)).where(Analysis.project_id == project.id)) or 0
    return _to_response(project, count)


@router.put("/{project_id}", response_model=ProjectResponse, summary="Update a project")
def update_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError(f"Project '{project_id}' not found", code="project_not_found")
    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    db.commit()
    db.refresh(project)
    count = db.scalar(select(func.count(Analysis.id)).where(Analysis.project_id == project.id)) or 0
    return _to_response(project, count)


@router.delete("/{project_id}", status_code=204, summary="Delete a project")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError(f"Project '{project_id}' not found", code="project_not_found")
    db.delete(project)
    db.commit()