"""Application configuration.

All runtime configuration comes from environment variables (or a local .env
file). No secrets are ever hard-coded in the source tree.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent
SEED_DIR = REPO_ROOT / "database" / "seed"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "NIRMAN AI"
    version: str = "0.1.0"
    environment: str = "development"

    # A SQLite default keeps the project runnable with zero infrastructure.
    # docker-compose overrides this with a PostGIS-enabled PostgreSQL URL.
    database_url: str = Field(default=f"sqlite:///{BACKEND_DIR / 'nirman.db'}")

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    jwt_secret: str = "change-me-in-production"

    # Decision-support posture
    demo_mode: bool = True
    auto_seed: bool = True

    # Copilot provider: mock | local | hosted
    ai_provider: str = "mock"
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None

    # IoT
    mqtt_broker_url: str | None = None

    # Directory of a built frontend to serve from this service (single-origin
    # deployment). Empty means API-only; the Vite dev server handles the UI.
    static_files_dir: str | None = None

    disclaimer: str = (
        "NIRMAN AI is a decision-support prototype. Demonstration datasets and "
        "AI-generated estimates require validation against authoritative data, "
        "engineering assessment and statutory approvals before real-world use."
    )

    @field_validator("ai_provider")
    @classmethod
    def _valid_provider(cls, v: str) -> str:
        allowed = {"mock", "local", "hosted"}
        if v not in allowed:
            raise ValueError(f"AI_PROVIDER must be one of {sorted(allowed)}")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgres")

    @property
    def seed_dir(self) -> Path:
        return SEED_DIR

    @property
    def static_dir(self) -> Path | None:
        """Built frontend to serve from this same service, if one is bundled.

        STATIC_DIR is set by the single-origin Docker image. Locally the Vite
        dev server serves the frontend instead, so this is normally unset.
        """
        if self.static_files_dir:
            return Path(self.static_files_dir)
        candidate = REPO_ROOT / "frontend" / "dist"
        return candidate if candidate.is_dir() else None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
