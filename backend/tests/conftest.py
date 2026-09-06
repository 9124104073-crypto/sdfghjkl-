"""Test fixtures.

Tests run against a throwaway SQLite database seeded from the real seed files,
so a broken seed file fails the suite rather than the demo.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

_TMP_DB = Path(tempfile.gettempdir()) / "nirman_test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"
os.environ["AI_PROVIDER"] = "mock"
os.environ["AUTO_SEED"] = "false"

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.seed import loader  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _database() -> Iterator[None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        loader.seed_all(db, force=True)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db() -> Iterator["object"]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
