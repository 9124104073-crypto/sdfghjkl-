"""NIRMAN Copilot orchestration.

The flow is fixed and the language model sits at the end of it:

    question -> intent detection -> NIRMAN decision engines -> database/GIS/
    risk/cost results -> provider explains -> sourced answer

The provider is handed structured results and a hard contract. It never
originates a score, cost, scheme, coordinate, population figure or regulation.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy.orm import Session

from app import repositories as repo
from app.core.constants import DataStatus
from app.engines import demand, priority as priority_engine, risk as risk_engine, schemes as scheme_engine
from app.engines import whatif as whatif_engine
from app.providers.ai import get_ai_provider
from app.services import persistence_service, project_service, rag_service, site_service

log = logging.getLogger(__name__)

INTENT_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ("why_site", ("why is this site", "why was this site", "why this site", "explain this site", "why recommended")),
    ("what_if", ("what happens if", "what if", "highest priority", "prioriti", "weight")),
    ("priority_for_budget", ("budget", "crore", "afford", "which projects should")),
    ("scheme", ("scheme", "funding", "grant", "sanction", "yojana", "mission")),
    ("project_summary", ("project summary", "summarise", "summarize", "dpr", "brief")),
    ("risk", ("risk", "flood", "vulnerab", "monsoon", "rainfall")),
    ("best_site", ("best area", "best site", "best location", "where should", "new hospital", "recommend")),
]

INFRASTRUCTURE_KEYWORDS = {
    "hospital": "Hospital",
    "health": "Health Centre",
    "clinic": "Health Centre",
    "school": "School",
    "fire": "Fire Station",
    "water": "Water Facility",
    "road": "Road",
    "community": "Community Centre",
}


def detect_intent(question: str) -> str:
    text = question.lower()
    for intent, keywords in INTENT_PATTERNS:
        if any(keyword in text for keyword in keywords):
            return intent
    return "general"


def _infrastructure_type(question: str) -> str:
    text = question.lower()
    for keyword, label in INFRASTRUCTURE_KEYWORDS.items():
        if keyword in text:
            return label
    return "Hospital"


def _locality(db: Session, question: str) -> str | None:
    """Match a Chennai locality named in the question, longest name first."""
    text = question.lower()
    names = {s.name for s in repo.all_sites(db)} | set(repo.risk_by_location(db))
    for name in sorted(names, key=len, reverse=True):
        if name.lower() in text:
            return name
    return None


def _budget(question: str) -> float | None:
    match = re.search(r"(\d[\d,]*\.?\d*)\s*(crore|cr\b)", question.lower())
    if not match:
        return None
    return float(match.group(1).replace(",", ""))


def _sources(db: Session, datasets: list[str]) -> list[dict[str, Any]]:
    rows = repo.data_sources(db)
    wanted = {d for d in datasets}
    return [
        {
            "dataset": r.dataset_name,
            "source": r.source_name,
            "source_url": r.source_url,
            "verification_status": r.verification_status,
            "is_demo_data": r.is_demo_data,
        }
        for r in rows
        if r.dataset_name in wanted
    ]


def build_context(
    db: Session,
    question: str,
    project_id: int | None = None,
    site_id: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the decision engines the question needs and collect their output."""
    intent = detect_intent(question)
    context: dict[str, Any] = {"intent": intent, "question": question}
    extra = extra or {}

    if intent == "best_site":
        infrastructure = _infrastructure_type(question)
        recommendation = site_service.recommend(db, infrastructure, limit=5)
        context["infrastructure_type"] = infrastructure
        context["ranked_sites"] = [
            {
                "site_id": r["site_id"],
                "site_name": r["site_name"],
                "score": r["score"],
                "confidence": r["confidence"],
                "recommendation": r["recommendation"],
                "factors": r["factors"][:3],
            }
            for r in recommendation["results"]
        ]
        context["sources"] = _sources(db, ["chennai_candidate_sites", "chennai_climate_risk"])

    elif intent == "why_site":
        target = site_id
        if target is None:
            name = _locality(db, question)
            site = repo.site_by_name(db, name) if name else None
            target = site.id if site else None
        if target is not None:
            context["explanation"] = site_service.explanation(
                db, target, _infrastructure_type(question)
            )
        context["sources"] = _sources(db, ["chennai_candidate_sites"])

    elif intent == "what_if":
        weights = extra.get("weights")
        if not weights and "flood" in question.lower():
            # "flood safety becomes highest priority" -> dominant flood weight.
            weights = {
                "budget": 15.0,
                "accessibility": 15.0,
                "flood_safety": 40.0,
                "population_coverage": 20.0,
                "sustainability": 10.0,
            }
        context["scenario"] = whatif_engine.simulate(repo.what_if_areas(db), weights, top_n=10)
        context["sources"] = _sources(db, ["chennai_what_if_areas"])

    elif intent == "priority_for_budget":
        ranking = priority_engine.rank(
            repo.priority_projects(db),
            repo.risk_by_location(db),
            repo.population_by_location(db),
            limit=10,
        )
        context["priority"] = ranking
        budget = _budget(question)
        if budget:
            context["budget_cr"] = budget
            projects = {p["area"] + "|" + p["name"]: p for p in project_service.portfolio(db)["projects"]}
            affordable: list[dict[str, Any]] = []
            running = 0.0
            for row in ranking["results"]:
                match = next(
                    (p for k, p in projects.items() if p["area"] == row["area"]),
                    None,
                )
                if match and match["budget_cr"] and running + match["budget_cr"] <= budget:
                    running += match["budget_cr"]
                    affordable.append(match)
            context["affordable_projects"] = affordable
        context["sources"] = _sources(db, ["chennai_priority_ranking", "chennai_dpr_projects"])

    elif intent == "scheme":
        project_type = extra.get("project_type")
        if project_id:
            project = repo.project_by_id(db, project_id)
            project_type = project.project_type if project else project_type
        if not project_type:
            project_type = scheme_engine.infer_project_type(question)
        context["scheme"] = scheme_engine.recommend(repo.schemes(db), project_type, question).as_dict()
        context["sources"] = _sources(db, ["government_scheme_reference", "chennai_scheme_mapping"])

    elif intent == "project_summary":
        target = project_id
        if target is None:
            name = _locality(db, question)
            if name:
                match = next((p for p in repo.all_projects(db) if p.area == name), None)
                target = match.id if match else None
        if target is not None:
            detail = project_service.detail(db, target)
            if detail:
                context["project"] = detail["project"]
                context["cost"] = detail["cost"]
                context["timeline"] = detail["timeline"]
                context["scheme"] = detail["scheme"]
        context["sources"] = _sources(db, ["chennai_dpr_projects", "government_scheme_reference"])

    elif intent == "risk":
        name = _locality(db, question)
        record = repo.risk_by_location(db).get(name) if name else None
        if record:
            context["risk"] = risk_engine.assess(record).as_dict()
            from app.services import iot_service

            fleet = iot_service.fleet_status(db)
            context["live_sensors"] = [d for d in fleet["devices"] if d["location"] == name]
        context["sources"] = _sources(db, ["chennai_climate_risk", "iot_demo_devices"])

    # Retrieval-augmented grounding: attach the platform's own methodology,
    # scheme and provenance passages so the provider can cite them. Retrieval
    # supplements the engine results - it never replaces them.
    try:
        passages = rag_service.search(db, question, top_k=3)
        if passages:
            context["retrieved"] = [p.as_dict() for p in passages]
    except Exception as exc:  # retrieval must never break an answer
        log.warning("RAG retrieval unavailable: %s", exc)

    if "sources" not in context or intent == "general":
        sites = repo.all_sites(db)
        projects = project_service.portfolio(db)
        risk_records = repo.risk_records(db)
        context["portfolio_summary"] = {
            "sites": len(sites),
            "projects": projects["summary"]["count"],
            "total_budget_cr": projects["summary"]["total_budget_cr"],
            "high_risk_areas": sum(
                1 for r in risk_records if r.flood_vulnerability in ("High", "Very High")
            ),
            "population_locations": len(repo.population_records(db)),
        }
        context.setdefault("sources", _sources(db, ["chennai_candidate_sites", "chennai_dpr_projects"]))

    return context


def answer(
    db: Session,
    question: str,
    project_id: int | None = None,
    site_id: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    context = build_context(db, question, project_id, site_id, extra)
    provider = get_ai_provider()
    result = provider.explain(question, context)
    payload = result.as_dict()
    payload["data_status"] = DataStatus.AI_GENERATED
    payload["retrieved"] = context.get("retrieved", [])
    payload["notes"] = [
        "The Copilot explains results produced by the NIRMAN decision engines. It does not "
        "generate scores, costs, schemes, coordinates, population figures or regulations.",
    ]
    if payload["retrieved"]:
        payload["notes"].append(
            f"{len(payload['retrieved'])} supporting passage(s) retrieved from the platform's "
            "own methodology, scheme reference and data registry."
        )

    persistence_service.record_ai_output(
        db,
        entity_type="copilot",
        entity_id=payload.get("intent") or "general",
        recommendation_type="copilot_answer",
        payload={"question": question, "answer": payload["answer"], "intent": payload.get("intent")},
        provider=payload.get("provider"),
    )
    persistence_service.audit(
        db, action="copilot.query", entity_type="copilot",
        entity_id=payload.get("intent"), detail=question[:400],
    )
    return payload


def suggested_questions() -> list[str]:
    return [
        "Which area is best for a new hospital?",
        "Why is this site recommended?",
        "What happens if flood safety becomes the highest priority?",
        "Which projects should be prioritised for a budget of 300 crore?",
        "Which government scheme is relevant for a storm water drain?",
        "What is the flood risk in Pallikaranai?",
        "Generate a preliminary project summary for Ambattur.",
    ]


__all__ = ["answer", "build_context", "detect_intent", "suggested_questions"]
