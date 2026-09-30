from app.services.query_service import parse_query
from app.core.errors import ValidationError


def test_water_query():
    plan = parse_query("Show water bodies in this image")
    assert plan.task == "water_detection"
    assert plan.operation == "single_date"
    assert plan.location is None


def test_change_detection_with_dates():
    plan = parse_query("Compare vegetation around this village between June 2025 and June 2026.")
    assert plan.task == "change_detection"
    assert plan.operation == "change_detection"
    assert plan.date_1 == "2025-06"
    assert plan.date_2 == "2026-06"


def test_building_query():
    plan = parse_query("Detect all buildings in the scene")
    assert plan.task == "building_detection"


def test_built_up_query():
    plan = parse_query("Analyze built-up area expansion")
    assert plan.task == "built_up_detection"


def test_vegetation_query():
    plan = parse_query("How much vegetation is there?")
    assert plan.task == "vegetation_analysis"


def test_landcover_query():
    plan = parse_query("Classify land cover types in this area")
    assert plan.task == "landcover"


def test_location_extraction():
    plan = parse_query("Analyze vegetation near Bangalore")
    assert plan.location == "Bangalore"


def test_unrecognized_query_raises():
    import pytest

    with pytest.raises(ValidationError):
        parse_query("What is the weather like today?")


def test_query_endpoint_requires_image(client, water_png):
    resp = client.post("/query", json={"query": "Show water bodies"})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "image_required"