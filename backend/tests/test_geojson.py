"""GeoJSON correctness tests using a georeferenced synthetic GeoTIFF."""

import json

from tests.conftest import upload, wait_for_analysis


def test_georeferenced_geojson_with_real_area(client, geotiff_bytes):
    img = upload(client, geotiff_bytes, "geo.tif")
    resp = client.post("/analysis/run", json={"image_id": img["image_id"], "analysis_type": "water_detection"})
    done = wait_for_analysis(client, resp.json()["analysis_id"])
    assert done["status"] == "completed"
    result = done["result"]

    geojson_url = result["visual_evidence"]["geojson"]
    assert geojson_url
    resp = client.get(geojson_url)
    assert resp.status_code == 200
    fc = resp.json()
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) >= 1

    feat = fc["features"][0]
    assert feat["geometry"]["type"] in ("Polygon", "MultiPolygon")
    # WGS84 coordinates must be within valid lon/lat range
    coords = feat["geometry"]["coordinates"]
    first_ring = coords[0] if feat["geometry"]["type"] == "Polygon" else coords[0][0]
    for lon, lat in first_ring:
        assert -180 <= lon <= 180
        assert -90 <= lat <= 90

    props = feat["properties"]
    assert props["area_m2"] is not None and props["area_m2"] > 0
    assert props["feature"] == "water"


def test_non_georeferenced_geojson_is_pixel_based(client, water_png):
    img = upload(client, water_png, "plain.png")
    resp = client.post("/analysis/run", json={"image_id": img["image_id"], "analysis_type": "water_detection"})
    done = wait_for_analysis(client, resp.json()["analysis_id"])
    fc = client.get(done["result"]["visual_evidence"]["geojson"]).json()
    props = fc["features"][0]["properties"]
    assert props["area_m2"] is None  # never fake a geographic area
    assert "not georeferenced" in props["note"]


def test_layers_endpoint(client, water_png):
    img = upload(client, water_png, "l.png")
    resp = client.post("/analysis/run", json={"image_id": img["image_id"], "analysis_type": "water_detection"})
    done = wait_for_analysis(client, resp.json()["analysis_id"])
    layers = client.get(f"/analyses/{done['analysis_id']}/layers").json()
    assert layers["analysis_id"] == done["analysis_id"]
    assert len(layers["layers"]) >= 3  # mask + annotated + geojson + detections

    first = layers["layers"][0]
    single = client.get(f"/layers/{first['layer_id']}")
    assert single.status_code == 200
    assert single.json()["layer_id"] == first["layer_id"]