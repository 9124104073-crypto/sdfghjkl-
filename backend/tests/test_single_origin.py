"""Single-origin deployment behaviour.

The deployed image serves the built frontend and the API from one service.
These tests pin the routing rules that make that safe: API routes must always
win over the SPA, and unknown paths must fall through to index.html so
client-side routing works on a hard refresh.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest


@pytest.fixture(scope="module")
def bundled_client():
    """A client for an app instance that has a frontend bundle mounted."""
    static = Path(tempfile.mkdtemp(prefix="nirman_static_"))
    (static / "index.html").write_text(
        "<!doctype html><title>NIRMAN AI</title><div id=root></div>", encoding="utf-8"
    )
    (static / "assets").mkdir()
    (static / "assets" / "app.js").write_text("console.log('spa')", encoding="utf-8")

    import importlib
    import os

    os.environ["STATIC_FILES_DIR"] = str(static)
    from app.core import config as config_module

    config_module.get_settings.cache_clear()
    config_module.settings = config_module.get_settings()

    import app.main as main_module

    main_module = importlib.reload(main_module)

    from fastapi.testclient import TestClient

    with TestClient(main_module.app) as client:
        yield client

    # Restore the API-only configuration for any later module.
    os.environ.pop("STATIC_FILES_DIR", None)
    config_module.get_settings.cache_clear()
    config_module.settings = config_module.get_settings()
    importlib.reload(main_module)
    shutil.rmtree(static, ignore_errors=True)


def test_root_serves_the_spa_not_json(bundled_client) -> None:
    r = bundled_client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert "NIRMAN AI" in r.text


def test_api_routes_still_win_over_the_spa(bundled_client) -> None:
    assert bundled_client.get("/health").json()["status"] == "ok"
    assert bundled_client.get("/api").json()["api"] == "/api/v1"
    assert bundled_client.get("/api/v1/dashboard").json()["metrics"]["sites_assessed"] == 40


def test_client_side_routes_fall_through_to_index(bundled_client) -> None:
    """A hard refresh on a deep link must not 404."""
    for path in ("/recommendation", "/what-if", "/dpr", "/data"):
        r = bundled_client.get(path)
        assert r.status_code == 200, path
        assert "text/html" in r.headers["content-type"]


def test_static_assets_are_served(bundled_client) -> None:
    r = bundled_client.get("/assets/app.js")
    assert r.status_code == 200
    assert "spa" in r.text


def test_unknown_api_path_still_404s(bundled_client) -> None:
    """The SPA fallback must not swallow genuine API errors."""
    assert bundled_client.get("/api/v1/not-a-real-endpoint").status_code == 404
