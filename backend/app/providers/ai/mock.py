"""MockAIProvider.

Template-driven, deterministic, and always available. It keeps the hackathon
demo fully working with no LLM configured, and it composes its answers only
from the structured context the decision engines produced.
"""

from __future__ import annotations

from typing import Any

from app.core.constants import DataStatus
from app.providers.ai.base import AIProvider, CopilotAnswer

INSUFFICIENT = "Insufficient verified data available."


class MockAIProvider(AIProvider):
    name = "mock"

    def explain(self, question: str, context: dict[str, Any]) -> CopilotAnswer:
        intent = context.get("intent", "general")
        handler = {
            "best_site": self._best_site,
            "why_site": self._why_site,
            "what_if": self._what_if,
            "priority_for_budget": self._priority,
            "scheme": self._scheme,
            "project_summary": self._project_summary,
            "risk": self._risk,
        }.get(intent, self._general)

        answer = handler(question, context)
        answer.provider = self.name
        answer.intent = intent
        answer.data_status = DataStatus.AI_GENERATED
        return answer

    # -- intent handlers -------------------------------------------------

    def _best_site(self, question: str, ctx: dict[str, Any]) -> CopilotAnswer:
        ranked = ctx.get("ranked_sites") or []
        if not ranked:
            return self._empty(ctx)
        top = ranked[0]
        infra = ctx.get("infrastructure_type", "facility")
        runners = ", ".join(f"{r['site_name']} ({r['score']:.1f})" for r in ranked[1:4])
        text = (
            f"For a {infra.lower()}, the NIRMAN Site Suitability Engine ranks "
            f"{top['site_name']} highest at {top['score']:.1f}/100 with "
            f"{top['confidence']:.0f}% confidence, placing it in the "
            f"'{top['recommendation']}' band."
        )
        if runners:
            text += f" Next best: {runners}."
        top_factors = ", ".join(
            f"{f['label'].lower()} {f['normalized']:.0f}/100" for f in top.get("factors", [])[:3]
        )
        if top_factors:
            text += f" The score is carried by {top_factors}."
        text += (
            " These are model outputs over demonstration data and need survey, engineering "
            "assessment and statutory approval before any siting decision."
        )
        return CopilotAnswer(
            answer=text,
            sources=ctx.get("sources", []),
            supporting_data={"top_sites": ranked[:5]},
            actions=[
                {"label": "Open site detail", "target": f"/sites/{top['site_id']}"},
                {"label": "View explainability", "target": f"/recommendation?site={top['site_id']}"},
            ],
            confidence=top.get("confidence"),
        )

    def _why_site(self, question: str, ctx: dict[str, Any]) -> CopilotAnswer:
        explanation = ctx.get("explanation")
        if not explanation:
            return self._empty(ctx)
        positives = explanation.get("positive_factors", [])[:3]
        negatives = explanation.get("negative_factors", [])[:2]
        text = explanation.get("why_this_site", "")
        if positives:
            text += " In favour: " + "; ".join(
                f"{p['label']} adds {p['delta_vs_baseline']:+.1f} points ({p['rationale']})"
                for p in positives
            ) + "."
        if negatives:
            text += " Against: " + "; ".join(
                f"{n['label']} removes {abs(n['delta_vs_baseline']):.1f} points ({n['rationale']})"
                for n in negatives
            ) + "."
        else:
            text += " No factor scored below the neutral baseline under this weighting."
        return CopilotAnswer(
            answer=text,
            sources=ctx.get("sources", []),
            supporting_data={"score_breakdown": explanation.get("score_breakdown")},
            actions=[{"label": "Adjust weights", "target": "/what-if"}],
            confidence=explanation.get("confidence"),
        )

    def _what_if(self, question: str, ctx: dict[str, Any]) -> CopilotAnswer:
        scenario = ctx.get("scenario")
        if not scenario:
            return self._empty(ctx)
        movers = scenario.get("movers", {})
        gain = movers.get("biggest_gain", {})
        drop = movers.get("biggest_drop", {})
        text = scenario.get("scenario_summary", "")
        if gain:
            text += (
                f" {gain.get('area')} moves from rank {gain.get('baseline_rank')} to "
                f"{gain.get('new_rank')} ({gain.get('score_change'):+.1f} points)."
            )
        if drop:
            text += (
                f" {drop.get('area')} falls from rank {drop.get('baseline_rank')} to "
                f"{drop.get('new_rank')}."
            )
        text += " Ranking is recalculated by the backend What-If Engine, not in the browser."
        return CopilotAnswer(
            answer=text,
            sources=ctx.get("sources", []),
            supporting_data={"weights": scenario.get("weights"), "top": scenario.get("results", [])[:5]},
            actions=[{"label": "Open What-If Simulator", "target": "/what-if"}],
        )

    def _priority(self, question: str, ctx: dict[str, Any]) -> CopilotAnswer:
        ranking = ctx.get("priority")
        if not ranking:
            return self._empty(ctx)
        rows = ranking.get("results", [])[:5]
        budget = ctx.get("budget_cr")
        listed = "; ".join(f"{r['computed_rank']}. {r['project']} ({r['area']})" for r in rows)
        text = f"Under the current priority weighting the leading projects are: {listed}."
        if budget:
            affordable = ctx.get("affordable_projects", [])
            total = sum(p.get("budget_cr", 0) for p in affordable)
            text += (
                f" Within a Rs {budget:,.0f} crore envelope, {len(affordable)} of these "
                f"can be taken up for an indicative Rs {total:,.0f} crore."
            )
        text += " Impact scores are demonstration values and not an official priority list."
        return CopilotAnswer(
            answer=text,
            sources=ctx.get("sources", []),
            supporting_data={"ranking": rows},
            actions=[{"label": "Open Priority Ranking", "target": "/priority"}],
        )

    def _scheme(self, question: str, ctx: dict[str, Any]) -> CopilotAnswer:
        scheme = ctx.get("scheme")
        if not scheme or not scheme.get("matched"):
            return CopilotAnswer(
                answer=(
                    f"{INSUFFICIENT} No scheme in the NIRMAN reference table lists this project "
                    "type as eligible. Add the scheme to the reference table with its "
                    "administering ministry and source before relying on a mapping."
                ),
                sources=ctx.get("sources", []),
                data_status=DataStatus.AI_GENERATED,
            )
        primary = scheme["primary"]
        text = (
            f"{primary['scheme_name']} ({primary.get('short_name') or 'n/a'}), administered by "
            f"{primary.get('ministry')}, is the closest funding match. {primary['reason']} "
            f"Verification status: {primary['verification_status']}."
        )
        alternatives = scheme.get("alternatives", [])
        if alternatives:
            text += " Alternatives worth checking: " + ", ".join(
                a["scheme_name"] for a in alternatives[:3]
            ) + "."
        text += " Confirm eligibility with the administering ministry before any sanction."
        return CopilotAnswer(
            answer=text,
            sources=ctx.get("sources", []),
            supporting_data={"scheme": primary},
            actions=[{"label": "Open Government Schemes", "target": "/schemes"}],
            confidence=primary.get("match_confidence"),
        )

    def _project_summary(self, question: str, ctx: dict[str, Any]) -> CopilotAnswer:
        project = ctx.get("project")
        if not project:
            return self._empty(ctx)
        cost = ctx.get("cost", {})
        timeline = ctx.get("timeline", {})
        scheme = (ctx.get("scheme") or {}).get("primary") or {}
        text = (
            f"{project['name']} at {project['area']} is a {project['sector'].lower()} project with a "
            f"suitability score of {project.get('suitability_score')}/100 and a "
            f"{project.get('dataset_risk_level', 'Medium')} risk classification. "
        )
        if cost:
            low, high = cost.get("range_cr", [None, None])
            text += (
                f"Planning-level cost is Rs {cost.get('estimate_cr')} crore "
                f"(range Rs {low}-{high} crore, {cost.get('contingency_pct')}% contingency). "
            )
        if timeline:
            text += (
                f"Estimated duration {timeline.get('total_months')} months with peak labour of "
                f"{timeline.get('peak_labour')}. "
            )
        if scheme:
            text += f"Indicative funding route: {scheme.get('scheme_name')}. "
        text += (
            "This is a preliminary AI-generated summary for portfolio prioritisation, not a "
            "sanctioned DPR."
        )
        return CopilotAnswer(
            answer=text,
            sources=ctx.get("sources", []),
            supporting_data={"cost": cost, "timeline": timeline},
            actions=[{"label": "Generate DPR", "target": f"/dpr?project={project.get('id')}"}],
        )

    def _risk(self, question: str, ctx: dict[str, Any]) -> CopilotAnswer:
        risk = ctx.get("risk")
        if not risk:
            return self._empty(ctx)
        components = ", ".join(f"{c['label'].lower()} {c['level']}" for c in risk.get("components", []))
        text = (
            f"{risk['location']} carries an overall {risk['overall_level']} risk classification "
            f"({risk['overall_score']:.0f}/100): {components}."
        )
        if risk.get("annual_rainfall_mm"):
            text += f" Annual rainfall in the dataset is {risk['annual_rainfall_mm']} mm."
        live = ctx.get("live_sensors") or []
        if live:
            text += " Live sensor overlay: " + "; ".join(
                f"{s['device_id']} {s['status']} at {s['current_value']}{s['unit']} ({s['trend']})"
                for s in live[:3]
            ) + "."
        text += (
            " This is a rule-based classification over demonstration indicators, not a validated "
            "flood forecast."
        )
        return CopilotAnswer(
            answer=text,
            sources=ctx.get("sources", []),
            supporting_data={"risk": risk},
            actions=[{"label": "Open Risk & Climate", "target": "/risk"}],
        )

    def _general(self, question: str, ctx: dict[str, Any]) -> CopilotAnswer:
        summary = ctx.get("portfolio_summary")
        if not summary:
            return self._empty(ctx)
        text = (
            f"The NIRMAN AI Chennai portfolio holds {summary.get('projects', 0)} proposed projects "
            f"across {summary.get('sites', 0)} assessed candidate sites, with an indicative outlay "
            f"of Rs {summary.get('total_budget_cr', 0):,.0f} crore. "
            f"{summary.get('high_risk_areas', 0)} localities are classified High or Very High risk. "
            "Ask about a specific site, project, scheme, risk profile or what-if scenario for a "
            "sourced answer."
        )
        return CopilotAnswer(
            answer=text,
            sources=ctx.get("sources", []),
            supporting_data={"portfolio": summary},
            actions=[
                {"label": "Site Recommendation", "target": "/recommendation"},
                {"label": "What-If Simulator", "target": "/what-if"},
            ],
        )

    def _empty(self, ctx: dict[str, Any]) -> CopilotAnswer:
        return CopilotAnswer(
            answer=(
                f"{INSUFFICIENT} The NIRMAN decision engines returned no structured result for "
                "this question. Try naming a Chennai locality, a project, or an infrastructure "
                "type such as hospital, school or fire station."
            ),
            sources=ctx.get("sources", []),
            data_status=DataStatus.AI_GENERATED,
        )
