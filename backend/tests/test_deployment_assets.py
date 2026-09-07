"""Static validation of the deployment assets.

Docker is not installed on every development machine, and the PostGIS path
cannot be executed without a running PostgreSQL. That is a real limit — these
tests do not pretend otherwise. What they *can* do is fail fast on the
mistakes that would otherwise only surface during a cloud build:

* migration SQL that is not valid PostgreSQL (checked with the real grammar
  via pglast, so the PL/pgSQL bodies are parsed rather than skipped)
* Dockerfile COPY sources that do not exist in the build context
* a compose file or blueprint that references a missing Dockerfile

Executing `docker compose up` against a live PostGIS instance remains
unverified and is called out in the deployment guide.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
MIGRATIONS = REPO / "database" / "migrations"
DOCKERFILES = [
    REPO / "docker" / "allinone.Dockerfile",
    REPO / "docker" / "backend.Dockerfile",
    REPO / "docker" / "frontend.Dockerfile",
]


def _copy_sources(dockerfile: Path) -> list[str]:
    """COPY sources from the build context (ignoring --from=stage copies)."""
    sources: list[str] = []
    for line in dockerfile.read_text(encoding="utf-8").splitlines():
        match = re.match(r"\s*COPY\s+(?!--from)(\S+)\s+\S+", line)
        if match:
            sources.append(match.group(1))
    return sources


def test_migration_files_exist() -> None:
    names = sorted(p.name for p in MIGRATIONS.glob("*.sql"))
    assert names == [
        "001_extensions.sql",
        "002_spatial_and_indexes.sql",
        "003_pgvector.sql",
    ]


def test_migrations_are_valid_postgresql() -> None:
    """Parsed with PostgreSQL's own grammar, not a permissive dialect."""
    pglast = pytest.importorskip("pglast", reason="pglast provides the real PG grammar")
    for path in sorted(MIGRATIONS.glob("*.sql")):
        statements = pglast.parse_sql(path.read_text(encoding="utf-8"))
        assert statements, f"{path.name} parsed to nothing"


def test_spatial_migration_is_idempotent_and_guarded() -> None:
    """It runs before and after the app creates tables, so it must be safe."""
    sql = (MIGRATIONS / "002_spatial_and_indexes.sql").read_text(encoding="utf-8")
    # Skips cleanly when the tables do not exist yet.
    assert "to_regclass" in sql
    # Never fails on a second run.
    assert "CREATE INDEX IF NOT EXISTS" in sql
    assert "IF NOT EXISTS (" in sql
    # Promotes lat/lon to real geometry in the projected sense.
    assert "ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)" in sql
    assert "USING GIST" in sql


def test_pgvector_migration_is_guarded() -> None:
    sql = (MIGRATIONS / "003_pgvector.sql").read_text(encoding="utf-8")
    assert "to_regclass" in sql
    assert "vector(" in sql
    assert "CREATE INDEX IF NOT EXISTS" in sql


@pytest.mark.parametrize("dockerfile", DOCKERFILES, ids=lambda p: p.name)
def test_dockerfile_copy_sources_exist(dockerfile: Path) -> None:
    """Every COPY source must resolve inside the build context."""
    assert dockerfile.exists()
    for source in _copy_sources(dockerfile):
        if "*" in source:
            # Glob: at least one file must match.
            parent = (REPO / source).parent
            pattern = Path(source).name
            assert parent.is_dir(), f"{source}: {parent} missing"
            assert list(parent.glob(pattern)), f"{source} matched nothing"
        else:
            assert (REPO / source).exists(), f"{source} missing from build context"


def test_allinone_image_serves_both_tiers() -> None:
    text = (REPO / "docker" / "allinone.Dockerfile").read_text(encoding="utf-8")
    assert "npm run build" in text            # frontend is built
    assert "STATIC_FILES_DIR" in text          # and handed to the API
    assert "--from=web" in text                # multi-stage copy
    assert "${PORT:-8000}" in text             # honours the host's port


def test_compose_and_blueprint_reference_real_dockerfiles() -> None:
    compose = (REPO / "docker-compose.yml").read_text(encoding="utf-8")
    render = (REPO / "render.yaml").read_text(encoding="utf-8")
    for text in (compose, render):
        for match in re.findall(r"(?:dockerfile|dockerfilePath):\s*(\S+)", text):
            path = REPO / match.lstrip("./")
            assert path.exists(), f"{match} referenced but missing"


def test_render_blueprint_has_no_committed_secret() -> None:
    render = (REPO / "render.yaml").read_text(encoding="utf-8")
    assert "generateValue: true" in render          # JWT secret generated, not stored
    assert "healthCheckPath: /health" in render
    assert "sk-" not in render
