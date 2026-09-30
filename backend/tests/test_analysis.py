from tests.conftest import upload, wait_for_analysis


def test_water_analysis_rgb(client, water_png):
    img = upload(client, water_png, "water.png")
    resp = client.post("/analysis/run", json={"image_id": img["image_id"], "analysis_type": "water_detection"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "queued"
    analysis_id = body["analysis_id"]

    done = wait_for_analysis(client, analysis_id)
    assert done["status"] == "completed"
    assert done["progress"] == 100

    result = done["result"]
    assert result["task"] == "water_detection"
    assert result["statistics"]["detection_count"] >= 1
    assert result["statistics"]["coverage_percent"] > 5.0  # real water found
    assert any(d["feature"] == "water" for d in result["detections"])
    assert result["confidence"] is None  # threshold method — no model confidence
    assert result["visual_evidence"]["mask"]
    assert result["visual_evidence"]["annotated_image"]
    assert "RGB" in " ".join(result["limitations"]) or any("RGB" in l for l in result["limitations"])


def test_vegetation_analysis_rgb(client, vegetation_png):
    img = upload(client, vegetation_png, "veg.png")
    resp = client.post("/analysis/run", json={"image_id": img["image_id"], "analysis_type": "vegetation_analysis"})
    done = wait_for_analysis(client, resp.json()["analysis_id"])
    assert done["status"] == "completed"
    result = done["result"]
    assert result["statistics"]["coverage_percent"] > 10.0
    assert result["method"] == "vari"
    assert any("VARI" in l for l in result["limitations"])


def test_vegetation_ndvi_on_geotiff(client, geotiff_bytes):
    img = upload(client, geotiff_bytes, "ms.tif")
    resp = client.post("/analysis/run", json={"image_id": img["image_id"], "analysis_type": "vegetation_analysis"})
    done = wait_for_analysis(client, resp.json()["analysis_id"])
    assert done["status"] == "completed"
    result = done["result"]
    assert result["method"] == "ndvi"
    assert result["statistics"]["coverage_percent"] > 10.0


def test_builtup_analysis_rgb(client, builtup_png):
    img = upload(client, builtup_png, "urban.png")
    resp = client.post("/analysis/run", json={"image_id": img["image_id"], "analysis_type": "built_up_detection"})
    done = wait_for_analysis(client, resp.json()["analysis_id"])
    assert done["status"] == "completed"
    assert done["result"]["statistics"]["detection_count"] >= 1


def test_change_detection(client, change_a_png, change_b_png):
    a = upload(client, change_a_png, "before.png")
    b = upload(client, change_b_png, "after.png")
    resp = client.post(
        "/analysis/run",
        json={"image_id": b["image_id"], "reference_image_id": a["image_id"], "analysis_type": "change_detection"},
    )
    done = wait_for_analysis(client, resp.json()["analysis_id"])
    assert done["status"] == "completed"
    result = done["result"]
    assert result["statistics"]["changed_percent"] > 1.0
    assert result["statistics"]["num_regions"] >= 1
    assert result["visual_evidence"]["diff_image"]


def test_change_detection_requires_reference(client, change_a_png):
    a = upload(client, change_a_png, "only.png")
    resp = client.post("/analysis/run", json={"image_id": a["image_id"], "analysis_type": "change_detection"})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "missing_reference_image"


def test_query_flow_end_to_end(client, water_png):
    img = upload(client, water_png, "q.png")
    resp = client.post("/query", json={"query": "Show water bodies in this image", "image_id": img["image_id"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["task"] == "water_detection"
    assert body["status"] == "queued"
    done = wait_for_analysis(client, body["analysis_id"])
    assert done["status"] == "completed"
    assert done["result"]["statistics"]["detection_count"] >= 1