"""Consistent error envelope + status code tests."""

from tests.conftest import upload


def test_consistent_error_shape(client):
    resp = client.get("/analysis/does-not-exist")
    assert resp.status_code == 404
    body = resp.json()
    assert set(body.keys()) == {"error"}
    assert body["error"]["code"] == "analysis_not_found"
    assert isinstance(body["error"]["message"], str)


def test_unknown_image_404(client):
    resp = client.post("/analysis/run", json={"image_id": "nope", "analysis_type": "water_detection"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "image_not_found"


def test_validation_error_422(client):
    resp = client.post("/analysis/run", json={"image_id": "x", "analysis_type": "not_a_task"})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


def test_query_without_image_422(client):
    resp = client.post("/query", json={"query": "Show water bodies"})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "image_required"


def test_project_crud(client):
    created = client.post("/projects", json={"name": "Test project", "description": "desc"})
    assert created.status_code == 201
    pid = created.json()["id"]

    got = client.get(f"/projects/{pid}")
    assert got.status_code == 200
    assert got.json()["name"] == "Test project"

    updated = client.put(f"/projects/{pid}", json={"name": "Renamed"})
    assert updated.json()["name"] == "Renamed"

    listing = client.get("/projects")
    assert any(p["id"] == pid for p in listing.json()["projects"])

    assert client.delete(f"/projects/{pid}").status_code == 204
    assert client.get(f"/projects/{pid}").status_code == 404


def test_report_flow(client, water_png):
    img = upload(client, water_png, "r.png")
    resp = client.post("/analysis/run", json={"image_id": img["image_id"], "analysis_type": "water_detection"})
    from tests.conftest import wait_for_analysis

    done = wait_for_analysis(client, resp.json()["analysis_id"])
    assert done["status"] == "completed"

    report = client.post("/reports", json={"analysis_id": done["analysis_id"], "format": "markdown"})
    assert report.status_code == 201
    rid = report.json()["id"]

    meta = client.get(f"/reports/{rid}")
    assert meta.status_code == 200

    dl = client.get(f"/reports/{rid}/download")
    assert dl.status_code == 200
    assert "Analysis ID" in dl.text


def test_report_requires_completed_analysis(client):
    resp = client.post("/reports", json={"analysis_id": "does-not-exist", "format": "pdf"})
    assert resp.status_code == 404