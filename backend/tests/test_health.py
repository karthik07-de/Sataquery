from app.main import app


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "SatQuery AI backend"


def test_docs_available(client):
    assert client.get("/docs").status_code == 200
    assert client.get("/redoc").status_code == 200


def test_openapi_schema(client):
    schema = client.get("/openapi.json").json()
    assert schema["info"]["title"] == "SatQuery AI API"
    paths = schema["paths"]
    for expected in ("/health", "/images/upload", "/query", "/analysis/run", "/analysis/{analysis_id}"):
        assert expected in paths, f"missing {expected}"


def test_cors_headers(client):
    resp = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"