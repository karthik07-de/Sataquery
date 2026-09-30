"""Geodata service — real geospatial features for natural-language queries.

Pipeline (mirrors the product architecture):

    natural-language query
        -> parse (query_service.parse_query)  : location + feature/task
        -> geocode  (OpenStreetMap Nominatim) : real place -> lat/lon + bbox
        -> fetch    (OpenStreetMap Overpass)  : real feature geometries
        -> measure  (pyproj Geod)             : true geodesic areas
        -> GeoJSON FeatureCollection + statistics

Exact geographic data always comes from open geodata sources — never from
an LLM. The NLP layer only decides *what* to look for and *where*.
"""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from typing import Any

import httpx
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, shape
from shapely.errors import GEOSException

from app.core.errors import ValidationError

logger = logging.getLogger(__name__)

# ── Geodesic area calculation ────────────────────────────────────────────
# pyproj.Geod is the most accurate option but may be blocked by OS policy.
# Fall back to a pure-Python Vincenty / spherical approximation if needed.

try:
    from pyproj import Geod as _Geod
    _GEOD = _Geod(ellps="WGS84")

    def _geodesic_area_m2(geom) -> float:
        try:
            area, _ = _GEOD.geometry_area_perimeter(geom)
        except Exception:  # noqa: BLE001
            return 0.0
        return abs(area)

except Exception:  # pyproj blocked or unavailable — use spherical approximation
    logger.warning("pyproj unavailable — falling back to spherical area approximation")
    import math as _math

    _R = 6_371_000.0  # mean Earth radius (m)

    def _shoelace_rad(coords_deg):
        """Shoelace formula in radians for a closed lon/lat ring."""
        n = len(coords_deg)
        area = 0.0
        for i in range(n):
            lon1, lat1 = [c * _math.pi / 180 for c in coords_deg[i]]
            lon2, lat2 = [c * _math.pi / 180 for c in coords_deg[(i + 1) % n]]
            area += (lon2 - lon1) * (2 + _math.sin(lat1) + _math.sin(lat2))
        return abs(area) * _R * _R / 2.0

    def _geodesic_area_m2(geom) -> float:
        try:
            if isinstance(geom, Polygon):
                return _shoelace_rad(list(geom.exterior.coords))
            if isinstance(geom, MultiPolygon):
                return sum(_shoelace_rad(list(p.exterior.coords)) for p in geom.geoms)
        except Exception:  # noqa: BLE001
            pass
        return 0.0

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_OVERPASS_URL = "https://overpass-api.de/api/interpreter"
_GEOSERVER_UA = "SatQuery-AI/0.1 (interactive satellite analysis demo)"
_GEOCODING_TIMEOUT_S = 15.0
_OVERPASS_TIMEOUT_S = 45.0


# ── Feature catalogue ────────────────────────────────────────────────────
# Each task maps to Overpass tag filters. Order matters only for display.

FEATURE_CATALOG: dict[str, dict[str, Any]] = {
    "water_detection": {
        "label": "Water Bodies",
        "subtypes": ["Lakes", "Reservoirs", "Rivers", "Ponds"],
        "filters": [
            'nwr["natural"="water"]',
            'nwr["waterway"~"^(river|riverbank|canal|stream|dock)$"]',
            'nwr["landuse"="reservoir"]',
        ],
        "color": "#4edea3",
    },
    "vegetation_analysis": {
        "label": "Vegetation",
        "subtypes": ["Forest", "Grassland", "Scrub", "Parks"],
        "filters": [
            'nwr["natural"="wood"]',
            'nwr["landuse"="forest"]',
            'nwr["natural"="scrub"]',
            'nwr["natural"="grassland"]',
            'nwr["landuse"="grass"]',
            'nwr["leisure"="park"]',
        ],
        "color": "#6fdc8c",
    },
    "built_up_detection": {
        "label": "Built-up Areas",
        "subtypes": ["Residential", "Commercial", "Industrial", "Buildings"],
        "filters": [
            'nwr["landuse"~"^(residential|commercial|industrial|retail)$"]',
            'nwr["building"]',
        ],
        "color": "#ffb95f",
    },
    "building_detection": {
        "label": "Buildings",
        "subtypes": ["Buildings"],
        "filters": ['nwr["building"]'],
        "color": "#adc6ff",
    },
    "agriculture": {
        "label": "Agricultural Land",
        "subtypes": ["Farmland", "Orchards", "Plantations"],
        "filters": [
            'nwr["landuse"~"^(farmland|orchard|vineyard|plant_nursery)$"]',
            'nwr["landuse"="farmyard"]',
        ],
        "color": "#d7f27d",
    },
}

# Tasks the frontend can ask for that we resolve to a catalogue entry.
_TASK_ALIASES = {
    "water_detection": "water_detection",
    "vegetation_analysis": "vegetation_analysis",
    "built_up_detection": "built_up_detection",
    "building_detection": "building_detection",
    "landcover": "built_up_detection",  # demo: show urban structure
    "feature_highlighting": "water_detection",
    "agriculture": "agriculture",
}


@dataclass
class GeoDataResult:
    """Everything the frontend needs to render a geodata response."""

    location: dict[str, Any]
    task: str
    feature_label: str
    color: str
    features: dict[str, Any]          # GeoJSON FeatureCollection
    statistics: dict[str, Any]
    plan: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "location": self.location,
            "task": self.task,
            "feature_label": self.feature_label,
            "color": self.color,
            "features": self.features,
            "statistics": self.statistics,
            "plan": self.plan,
            "source": "OpenStreetMap (ODbL) via Overpass API",
            "imagery_note": "Feature geometries from OpenStreetMap vector data",
        }


# ── Geocoding ────────────────────────────────────────────────────────────

async def geocode(place: str) -> dict[str, Any]:
    """Resolve a place name to coordinates + bbox via Nominatim."""
    if not place or not place.strip():
        raise ValidationError("No location found in the query.", code="no_location")

    params = {"q": place.strip(), "format": "json", "limit": 1, "addressdetails": 0}
    try:
        async with httpx.AsyncClient(timeout=_GEOCODING_TIMEOUT_S) as client:
            resp = await client.get(_NOMINATIM_URL, params=params, headers={"User-Agent": _GEOSERVER_UA})
            resp.raise_for_status()
            results = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("Geocoding failed for %r: %s", place, exc)
        raise ValidationError(
            f"Could not reach the geocoding service for '{place}'. Try again shortly.",
            code="geocoder_unreachable",
        ) from exc

    if not results:
        raise ValidationError(
            f"Unknown location: '{place}'. Try a city or region name.",
            code="unknown_location",
        )

    top = results[0]
    lat, lon = float(top["lat"]), float(top["lon"])
    bbox_raw = top.get("boundingbox") or []
    # Nominatim bbox = [south, north, west, east] (strings)
    bbox = None
    if len(bbox_raw) == 4:
        bbox = [float(bbox_raw[0]), float(bbox_raw[1]), float(bbox_raw[2]), float(bbox_raw[3])]

    return {
        "name": top.get("name") or top.get("display_name", place),
        "display_name": top.get("display_name", place),
        "lat": lat,
        "lon": lon,
        "bbox": bbox,
        "type": top.get("type"),
    }


# ── Overpass feature fetch ───────────────────────────────────────────────

def _build_overpass_query(task: str, lat: float, lon: float, radius_m: int) -> str:
    filters = FEATURE_CATALOG[task]["filters"]
    body = "\n".join(f"  {f}(around:{radius_m},{lat:.6f},{lon:.6f});" for f in filters)
    return f"[out:json][timeout:{int(_OVERPASS_TIMEOUT_S)}];\n(\n{body}\n);\nout body geom;"


def _bbox_radius(bbox: list[float] | None, default_m: int = 6000, max_m: int = 30000) -> int:
    """Radius (m) that roughly covers a Nominatim bbox, clamped for sanity."""
    if not bbox or len(bbox) != 4:
        return default_m
    south, north, west, east = bbox
    try:
        # Pure-Python haversine distance for width and height
        import math
        def _haversine(lat1, lon1, lat2, lon2):
            R = 6_371_000.0
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
            return R * 2 * math.asin(math.sqrt(a))
        cross_w = _haversine(south, west, south, east)
        cross_h = _haversine(south, west, north, west)
    except Exception:  # noqa: BLE001
        return default_m
    radius = max(cross_w, cross_h) / 2.0
    return int(min(max(radius, 800), max_m))


def _polygon_area_m2(geom: Polygon | MultiPolygon) -> float:
    """True geodesic area (m²) via WGS84 ellipsoid or spherical fallback."""
    return _geodesic_area_m2(geom)


def _classify_element(tags: dict[str, str]) -> str:
    """Human-readable subtype from OSM tags."""
    if tags.get("natural") == "water":
        w = tags.get("water")
        return {"lake": "Lakes", "pond": "Ponds", "reservoir": "Reservoirs", "river": "Rivers"}.get(
            w, "Rivers" if tags.get("waterway") else "Water Bodies"
        )
    if tags.get("waterway"):
        return {"river": "Rivers", "canal": "Canals", "stream": "Streams", "dock": "Docks"}.get(
            tags["waterway"], "Rivers"
        )
    if tags.get("natural") in ("wood", "scrub", "grassland") or tags.get("landuse") in ("forest", "grass"):
        return {"wood": "Forest", "forest": "Forest", "scrub": "Scrub", "grassland": "Grassland", "grass": "Grassland"}.get(
            tags.get("natural") or tags.get("landuse"), "Vegetation"
        )
    if tags.get("leisure") == "park":
        return "Parks"
    if tags.get("landuse") in ("farmland", "orchard", "vineyard", "plant_nursery"):
        return {"farmland": "Farmland", "orchard": "Orchards", "vineyard": "Vineyards", "plant_nursery": "Nurseries"}[tags["landuse"]]
    if tags.get("building"):
        return "Buildings"
    if tags.get("landuse") in ("residential", "commercial", "industrial", "retail"):
        return tags["landuse"].capitalize()
    return "Features"


def _element_to_shapely(el: dict[str, Any]):
    """Convert an Overpass element (with `geometry` from `out geom`) to shapely."""
    geom = el.get("geometry") or []
    if not geom:
        return None
    coords = [(p["lon"], p["lat"]) for p in geom if p.get("lon") is not None and p.get("lat") is not None]
    if len(coords) < 2:
        return None

    t = el.get("type")
    if t == "way":
        if len(coords) >= 4 and coords[0] == coords[-1]:
            try:
                return Polygon(coords)
            except GEOSException:
                return None
        try:
            return LineString(coords)
        except GEOSException:
            return None
    if t == "relation":
        # Overpass returns one member geometry block per relation with `out geom`.
        # A closed ring is a polygon; anything else we treat as a line.
        if len(coords) >= 4 and coords[0] == coords[-1]:
            try:
                return Polygon(coords)
            except GEOSException:
                return None
        try:
            return LineString(coords)
        except GEOSException:
            return None
    return None


def _shapely_to_geojson_geometry(geom) -> dict[str, Any] | None:
    """Map shapely geometry to a GeoJSON geometry dict, in GeoJSON lon/lat order."""
    if geom.is_empty:
        return None
    if isinstance(geom, Point):
        return {"type": "Point", "coordinates": [geom.x, geom.y]}
    if isinstance(geom, LineString):
        return {"type": "LineString", "coordinates": list(geom.coords)}
    if isinstance(geom, Polygon):
        return {
            "type": "Polygon",
            "coordinates": [list(geom.exterior.coords)] + [list(r.coords) for r in geom.interiors],
        }
    if isinstance(geom, MultiPolygon):
        return {
            "type": "MultiPolygon",
            "coordinates": [
                [list(p.exterior.coords)] + [list(r.coords) for r in p.interiors] for p in geom.geoms
            ],
        }
    return None


def parse_overpass(elements: list[dict[str, Any]], task: str) -> dict[str, Any]:
    """Turn Overpass elements into a GeoJSON FeatureCollection + statistics."""
    features: list[dict[str, Any]] = []
    subtype_counts: dict[str, int] = {}
    total_area = 0.0
    named = 0

    for el in elements:
        tags = el.get("tags") or {}
        shapely_geom = _element_to_shapely(el)
        if shapely_geom is None or shapely_geom.is_empty:
            continue

        area_m2 = None
        if isinstance(shapely_geom, (Polygon, MultiPolygon)):
            area_m2 = _polygon_area_m2(shapely_geom)
            if area_m2 < 1.0:  # degenerate ring
                area_m2 = None

        geometry = _shapely_to_geojson_geometry(shapely_geom)
        if geometry is None:
            continue

        subtype = _classify_element(tags)
        subtype_counts[subtype] = subtype_counts.get(subtype, 0) + 1
        if tags.get("name"):
            named += 1

        props = {
            "osm_type": el.get("type"),
            "osm_id": el.get("id"),
            "feature": subtype,
            "name": tags.get("name") or tags.get("name:en"),
            "area_m2": round(area_m2, 1) if area_m2 is not None else None,
            "tags": {k: v for k, v in tags.items() if k in (
                "natural", "water", "waterway", "landuse", "leisure", "building", "name",
            )},
            "fillColor": FEATURE_CATALOG[task]["color"],
        }
        features.append({"type": "Feature", "geometry": geometry, "properties": props})

    # Largest first so big lakes render before small ponds (Leaflet z-order).
    features.sort(
        key=lambda f: f["properties"]["area_m2"] or 0,
        reverse=True,
    )

    total_area = sum(f["properties"]["area_m2"] or 0.0 for f in features)
    return {
        "type": "FeatureCollection",
        "features": features,
        "properties": {"task": task, "color": FEATURE_CATALOG[task]["color"]},
    }, {
        "detection_count": len(features),
        "named_features": named,
        "total_area_m2": round(total_area, 1),
        "subtype_counts": subtype_counts,
    }


async def fetch_features(task: str, lat: float, lon: float, radius_m: int) -> dict[str, Any]:
    """Fetch real feature geometries from Overpass for a task around a point."""
    query = _build_overpass_query(task, lat, lon, radius_m)
    try:
        async with httpx.AsyncClient(timeout=_OVERPASS_TIMEOUT_S) as client:
            resp = await client.post(
                _OVERPASS_URL,
                data={"data": query},
                headers={"User-Agent": _GEOSERVER_UA},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("Overpass request failed: %s", exc)
        raise ValidationError(
            "Could not reach the OpenStreetMap data service. Try again shortly.",
            code="overpass_unreachable",
        ) from exc

    elements = data.get("elements", [])
    fc, stats = parse_overpass(elements, task)
    fc["properties"]["radius_m"] = radius_m
    return fc, stats


# ── Public entry point ───────────────────────────────────────────────────

async def run_geodata_query(query: str, parsed_plan) -> GeoDataResult:
    """Parse -> geocode -> fetch -> measure. `parsed_plan` is a QueryPlan."""
    task = _TASK_ALIASES.get(parsed_plan.task, "water_detection")
    location_name = parsed_plan.location

    if not location_name:
        raise ValidationError(
            "No location found in the query — e.g. 'Show water bodies in Bangalore'.",
            code="no_location",
        )

    loc = await geocode(location_name)
    radius = _bbox_radius(loc.get("bbox"))
    fc, stats = await fetch_features(task, loc["lat"], loc["lon"], radius)

    catalog = FEATURE_CATALOG[task]
    return GeoDataResult(
        location=loc,
        task=task,
        feature_label=catalog["label"],
        color=catalog["color"],
        features=fc,
        statistics=stats,
        plan={
            "raw_query": parsed_plan.raw_query,
            "matched_keywords": parsed_plan.matched_keywords,
            "operation": parsed_plan.operation,
            "requested_task": parsed_plan.task,
            "resolved_task": task,
            "date_1": parsed_plan.date_1,
            "date_2": parsed_plan.date_2,
        },
    )
