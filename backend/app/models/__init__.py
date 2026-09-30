"""SQLAlchemy models.

Geometry is stored as GeoJSON (JSON column) so the same models run on SQLite
(development) and PostgreSQL/PostGIS (production).
"""

from app.models.user import User
from app.models.project import Project
from app.models.query import Query
from app.models.imagery import Imagery
from app.models.analysis import Analysis
from app.models.detection import Detection
from app.models.geometry import Geometry
from app.models.result import Result
from app.models.change_detection import ChangeDetection
from app.models.map_layer import MapLayer
from app.models.query_history import QueryHistory
from app.models.report import Report
from app.models.saved_location import SavedLocation
from app.models.model_config import ModelConfig
from app.models.imagery_embedding import ImageryEmbedding

__all__ = [
    "User",
    "Project",
    "Query",
    "Imagery",
    "Analysis",
    "Detection",
    "Geometry",
    "Result",
    "ChangeDetection",
    "MapLayer",
    "QueryHistory",
    "Report",
    "SavedLocation",
    "ModelConfig",
    "ImageryEmbedding",
]
