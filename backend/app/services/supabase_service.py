"""Optional Supabase adapters for verified accounts and durable file storage.

The application keeps its domain data behind SQLAlchemy. Pointing
``DATABASE_URL`` at Supabase Postgres moves every model there without changing
the decision engines. This module only covers Supabase-specific Auth and
Storage APIs and is deliberately inactive until all relevant environment
variables are configured.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings


class SupabaseError(RuntimeError):
    """A safe, user-facing error returned by Supabase services."""


def _base_url() -> str:
    return (settings.supabase_url or "").rstrip("/")


def _auth_headers() -> dict[str, str]:
    key = settings.supabase_anon_key or ""
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _service_headers() -> dict[str, str]:
    key = settings.supabase_service_role_key or ""
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _raise_for_error(response: httpx.Response) -> None:
    if response.is_success:
        return
    try:
        detail = response.json().get("msg") or response.json().get("message")
    except ValueError:
        detail = None
    raise SupabaseError(detail or "Supabase could not complete this request.")


def sign_up(email: str, password: str, name: str) -> dict[str, Any]:
    """Create a Supabase account and request its confirmation email."""
    if not settings.supabase_auth_enabled:
        raise SupabaseError("Supabase Auth is not configured.")
    options: dict[str, Any] = {"data": {"name": name}}
    if settings.supabase_redirect_url:
        options["emailRedirectTo"] = settings.supabase_redirect_url
    with httpx.Client(timeout=15) as client:
        response = client.post(
            f"{_base_url()}/auth/v1/signup",
            headers=_auth_headers(),
            json={"email": email, "password": password, "options": options},
        )
    _raise_for_error(response)
    return response.json().get("user") or {}


def sign_in(email: str, password: str) -> dict[str, Any]:
    """Exchange an email/password for a confirmed Supabase user profile."""
    if not settings.supabase_auth_enabled:
        raise SupabaseError("Supabase Auth is not configured.")
    with httpx.Client(timeout=15) as client:
        response = client.post(
            f"{_base_url()}/auth/v1/token?grant_type=password",
            headers=_auth_headers(),
            json={"email": email, "password": password},
        )
    _raise_for_error(response)
    payload = response.json()
    user = payload.get("user") or {}
    if not user.get("email_confirmed_at"):
        raise SupabaseError("Verify your email address before signing in.")
    return user


def _ensure_bucket() -> None:
    if not settings.supabase_storage_enabled:
        return
    with httpx.Client(timeout=20) as client:
        response = client.post(
            f"{_base_url()}/storage/v1/bucket",
            headers={**_service_headers(), "Content-Type": "application/json"},
            json={"id": settings.supabase_storage_bucket, "name": settings.supabase_storage_bucket, "public": False},
        )
    # A duplicate bucket is the expected result after the first run.
    if response.status_code not in (200, 201, 400, 409):
        _raise_for_error(response)


def upload_bytes(path: str, content: bytes, content_type: str) -> None:
    """Upsert a private object. Service-role credentials never reach React."""
    if not settings.supabase_storage_enabled:
        return
    _ensure_bucket()
    with httpx.Client(timeout=30) as client:
        response = client.post(
            f"{_base_url()}/storage/v1/object/{settings.supabase_storage_bucket}/{path.lstrip('/')}",
            headers={**_service_headers(), "Content-Type": content_type, "x-upsert": "true"},
            content=content,
        )
    _raise_for_error(response)


def sync_seed_files(seed_dir: Path) -> int:
    """Copy replaceable source datasets to durable private object storage."""
    if not settings.supabase_storage_enabled or not seed_dir.exists():
        return 0
    uploaded = 0
    for source in seed_dir.rglob("*"):
        if source.is_file():
            upload_bytes(f"seed/{source.relative_to(seed_dir).as_posix()}", source.read_bytes(), "application/octet-stream")
            uploaded += 1
    return uploaded
