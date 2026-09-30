"""Building detection must be HONEST when no model is configured.

Instead of fabricating counts, the analysis must fail with a clear
model_not_configured error.
"""

from tests.conftest import upload, wait_for_analysis


def test_building_detection_returns_model_not_configured(client, builtup_png):
    img = upload(client, builtup_png, "b.png")
    resp = client.post("/analysis/run", json={"image_id": img["image_id"], "analysis_type": "building_detection"})
    done = wait_for_analysis(client, resp.json()["analysis_id"])
    assert done["status"] == "failed"
    assert done["error_code"] == "model_not_configured"
    assert "model" in done["error_message"].lower() or "configured" in done["error_message"].lower()


def test_building_service_interface_raises():
    """The service raises ModelNotConfiguredError (no fake boxes)."""
    from app.core.errors import ModelNotConfiguredError
    from app.ml import building_detection

    assert building_detection.is_configured() is False
    try:
        building_detection.detect_buildings(None)
        raise AssertionError("expected ModelNotConfiguredError")
    except ModelNotConfiguredError:
        pass