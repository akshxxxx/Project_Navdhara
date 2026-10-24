"""POST /field-report/photo and the /report-photos mount (log.md L-048)."""
import struct
import zlib

from fastapi.testclient import TestClient

from app.main import app
from app.routes import reports

client = TestClient(app)


def _tiny_png() -> bytes:
    """A valid 1x1 PNG, built here so the test needs no image file."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = zlib.compress(b"\x00\xff\x00\x00")
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


def test_upload_png_returns_url_that_serves_the_file():
    png = _tiny_png()
    res = client.post("/field-report/photo", files={"photo": ("road.png", png, "image/png")})
    assert res.status_code == 201, res.text
    url = res.json()["photo_url"]
    assert url.startswith("http") and "/report-photos/" in url and url.endswith(".png")
    path = "/report-photos/" + url.rsplit("/", 1)[1]
    try:
        served = client.get(path)
        assert served.status_code == 200
        assert served.content == png
        # The URL fits the report's photo_url field and is accepted by the report itself
        assert len(url) <= 500
    finally:
        (reports.PHOTO_DIR / url.rsplit("/", 1)[1]).unlink(missing_ok=True)


def test_rejects_files_that_are_not_images_even_if_labelled_jpeg():
    res = client.post("/field-report/photo", files={"photo": ("x.jpg", b"<html>not a photo</html>", "image/jpeg")})
    assert res.status_code == 415


def test_rejects_photos_over_3_mb(monkeypatch):
    monkeypatch.setattr(reports, "MAX_PHOTO_BYTES", 1024)
    big = b"\xff\xd8\xff" + b"0" * 2048
    res = client.post("/field-report/photo", files={"photo": ("big.jpg", big, "image/jpeg")})
    assert res.status_code == 413


def test_report_accepts_the_returned_photo_url():
    png = _tiny_png()
    up = client.post("/field-report/photo", files={"photo": ("road.png", png, "image/png")})
    url = up.json()["photo_url"]
    try:
        res = client.post(
            "/field-report",
            json={
                "lat": 30.2316,
                "lng": 78.7899,
                "description": "[Falling stones] km 114: test with photo",
                "reporter_name": "Test",
                "photo_url": url,
            },
        )
        assert res.status_code == 201, res.text
        listed = client.get("/field-reports").json()
        assert any(r["photo_url"] == url for r in listed)
    finally:
        (reports.PHOTO_DIR / url.rsplit("/", 1)[1]).unlink(missing_ok=True)
