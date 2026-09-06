"""Persistence of engine output, AI results and the audit trail.

The build plan names `site_scores`, `ai_recommendations` and `audit_logs` as
first-class tables. Scoring itself stays stateless and reproducible — these
records are the history of what the platform actually told people, which is
what makes a decision-support system reviewable after the fact.

Writes here must never break a read path: a failure to record history is
logged and swallowed, because losing an audit row is not a reason to fail the
planner's request.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import DataStatus
from app.models import AiRecommendation, AuditLog, SiteScore

log = logging.getLogger(__name__)

MAX_PAYLOAD_CHARS = 200_000


def record_site_scores(
    db: Session,
    results: list[dict[str, Any]],
    infrastructure_type: str,
    provider: str = "mcda",
) -> int:
    """Persist a scoring run so a recommendation can be reviewed later."""
    written = 0
    try:
        for r in results:
            db.add(
                SiteScore(
                    site_id=r["site_id"],
                    infrastructure_type=infrastructure_type,
                    score=float(r["score"]),
                    confidence=float(r.get("confidence") or 0),
                    recommendation=r["recommendation"],
                    weights_json=json.dumps(r.get("weights") or {}),
                    factors_json=json.dumps(r.get("factors") or [])[:MAX_PAYLOAD_CHARS],
                    explanation=r.get("explanation"),
                    data_status=r.get("data_status", DataStatus.DERIVED),
                )
            )
            written += 1
        db.commit()
    except Exception as exc:  # pragma: no cover - history must not break reads
        db.rollback()
        log.warning("Could not persist site scores: %s", exc)
        return 0
    return written


def record_ai_output(
    db: Session,
    entity_type: str,
    entity_id: str | int,
    recommendation_type: str,
    payload: dict[str, Any],
    provider: str | None = None,
    data_status: str = DataStatus.AI_GENERATED,
) -> None:
    """Persist an AI/engine output (DPR run, Copilot answer, ML prediction)."""
    try:
        db.add(
            AiRecommendation(
                entity_type=entity_type,
                entity_id=str(entity_id),
                recommendation_type=recommendation_type,
                payload_json=json.dumps(payload, default=str)[:MAX_PAYLOAD_CHARS],
                data_status=data_status,
                provider=provider,
            )
        )
        db.commit()
    except Exception as exc:  # pragma: no cover
        db.rollback()
        log.warning("Could not persist AI output: %s", exc)


def audit(
    db: Session,
    action: str,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    detail: str | None = None,
    actor: str = "system",
) -> None:
    """Append an audit-trail entry."""
    try:
        db.add(
            AuditLog(
                actor=actor,
                action=action,
                entity_type=entity_type,
                entity_id=None if entity_id is None else str(entity_id),
                detail=detail,
            )
        )
        db.commit()
    except Exception as exc:  # pragma: no cover
        db.rollback()
        log.warning("Could not write audit log: %s", exc)


def recent_scores(db: Session, site_id: int | None = None, limit: int = 50) -> list[dict[str, Any]]:
    stmt = select(SiteScore).order_by(SiteScore.created_at.desc()).limit(limit)
    if site_id:
        stmt = (
            select(SiteScore)
            .where(SiteScore.site_id == site_id)
            .order_by(SiteScore.created_at.desc())
            .limit(limit)
        )
    return [
        {
            "id": s.id,
            "site_id": s.site_id,
            "infrastructure_type": s.infrastructure_type,
            "score": s.score,
            "confidence": s.confidence,
            "recommendation": s.recommendation,
            "weights": json.loads(s.weights_json) if s.weights_json else {},
            "explanation": s.explanation,
            "data_status": s.data_status,
            "recorded_at": s.created_at.isoformat(),
        }
        for s in db.scalars(stmt).all()
    ]


def recent_ai_outputs(db: Session, limit: int = 50) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(AiRecommendation).order_by(AiRecommendation.created_at.desc()).limit(limit)
    ).all()
    return [
        {
            "id": r.id,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "recommendation_type": r.recommendation_type,
            "provider": r.provider,
            "data_status": r.data_status,
            "recorded_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


def recent_audit(db: Session, limit: int = 100) -> list[dict[str, Any]]:
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)).all()
    return [
        {
            "id": a.id,
            "actor": a.actor,
            "action": a.action,
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "detail": a.detail,
            "at": a.created_at.isoformat(),
        }
        for a in rows
    ]
