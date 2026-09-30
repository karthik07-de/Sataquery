"""Geodata endpoint — natural-language query -> real map features.

This is the endpoint behind the SatQuery search box:
`POST /geodata` with `{"query": "Show water bodies in Bangalore"}` returns
real lake/river/etc. geometries (GeoJSON), measured statistics, and the
geocoded location — everything the map needs to fly there and highlight.

Geographic truth comes from OpenStreetMap (Nominatim + Overpass).
No LLM is involved in producing coordinates or geometries.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from app.schemas.geodata import GeoDataRequest, GeoDataResponse
from app.services import geodata_service, query_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["geodata"])


@router.post(
    "/geodata",
    response_model=GeoDataResponse,
    summary="Resolve a natural-language query into real geospatial features",
    description=(
        "Parses the query (location + feature type), geocodes the location via "
        "OpenStreetMap Nominatim, fetches real feature geometries (water bodies, "
        "vegetation, built-up areas, agriculture) from the Overpass API, measures "
        "their geodesic areas, and returns a GeoJSON FeatureCollection ready to "
        "render on the map."
    ),
)
async def submit_geodata_query(body: GeoDataRequest) -> GeoDataResponse:
    plan = query_service.parse_query(body.query)
    result = await geodata_service.run_geodata_query(body.query, plan)
    return GeoDataResponse(**result.to_dict())
