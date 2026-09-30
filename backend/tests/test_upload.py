from tests.conftest import upload


def test_upload_png(client, water_png):
    data = upload(client, water_png, "scene.png")
    assert data["image_id"]
    assert data["filename"] != "scene.png"  # sanitized
    assert data["width"] == 256 and data["height"] == 256
    assert data["bands"] == 3
    assert data["is_georeferenced"] is False
    assert data["crs"] is None
    assert data["bounds"] is None
    assert data["url"].startswith("/uploads/")


def test_upload_jpeg(client, vegetation_png):
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.open(io.BytesIO(vegetation_png)).save(buf, "JPEG", quality=90)
    data = upload(client, buf.getvalue(), "scene.jpg")
    assert data["bands"] == 3


def test_upload_geotiff_metadata(client, geotiff_bytes):
    data = upload(client, geotiff_bytes, "sentinel2.tif")
    assert data["is_georeferenced"] is True
    assert data["crs"] == "EPSG:32651"
    assert data["bands"] == 4
    assert data["width"] == 256 and data["height"] == 256
    assert len(data["bounds"]) == 4
    # center is WGS84 [lon, lat] — must be valid geographic coordinates
    lon, lat = data["center"]
    assert -180 <= lon <= 180 and -90 <= lat <= 90
    assert round(lon, 1) == 123.0  # UTM zone 51N center maps to ~123E
    assert data["resolution"]["x"] == 10.0


def test_upload_invalid_extension(client, water_png):
    resp = client.post("/images/upload", files={"file": ("notes.txt", b"hello")})
    assert resp.status_code == 400
    body = resp.json()["error"]
    assert body["code"] == "unsupported_file_type"


def test_upload_corrupted_image(client):
    resp = client.post("/images/upload", files={"file": ("fake.png", b"not really an image")})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] in ("invalid_image", "unsupported_file_type")


def test_upload_missing_file(client):
    resp = client.post("/images/upload")
    assert resp.status_code == 422