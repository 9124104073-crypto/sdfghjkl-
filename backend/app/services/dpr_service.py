"""AI DPR Generator.

Assembles a Detailed Project Report from structured decision-engine output and
renders it to PDF with ReportLab. Every figure in the report is traceable to a
named engine or dataset, and the disclaimer is not optional.
"""

from __future__ import annotations

import io
from datetime import date
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.orm import Session

from app import repositories as repo
from app.core.constants import DISCLAIMER, DataStatus
from app.engines import risk as risk_engine
from app.services import project_service, site_service

BRAND = colors.HexColor("#0F766E")
BRAND_LIGHT = colors.HexColor("#CCFBF1")
INK = colors.HexColor("#0F172A")
MUTED = colors.HexColor("#475569")
RULE = colors.HexColor("#CBD5E1")


def build_dpr(db: Session, project_id: int, include_explainability: bool = True) -> dict[str, Any] | None:
    """Collect every section of the DPR as structured data."""
    detail = project_service.detail(db, project_id)
    if detail is None:
        return None

    project = detail["project"]
    risk_record = repo.risk_by_location(db).get(project["area"])
    risk_result = risk_engine.assess(risk_record).as_dict() if risk_record else None

    explainability = None
    site_payload = None
    if project.get("site_id"):
        site_payload = site_service.site_to_dict(repo.site_by_id(db, project["site_id"]))
        if include_explainability:
            explainability = site_service.explanation(
                db, project["site_id"], _infrastructure_for(project["project_type"])
            )

    population = repo.population_by_location(db).get(project["area"])
    sources = repo.data_sources(db)

    return {
        "generated_on": date.today().isoformat(),
        "project": project,
        "site": site_payload,
        "executive_summary": _executive_summary(project, detail, risk_result),
        "cost": detail["cost"],
        "timeline": detail["timeline"],
        "scheme": detail["scheme"],
        "dataset_scheme": detail["dataset_scheme"],
        "risk": risk_result,
        "project_risks": detail["risks"],
        "explainability": explainability,
        "population": {
            "location": population.location,
            "population_2026": population.population_2026,
            "projected_2045": population.projected_2045,
            "growth_priority": population.growth_priority,
        }
        if population
        else None,
        "data_sources": [
            {
                "dataset": s.dataset_name,
                "source": s.source_name,
                "source_url": s.source_url,
                "verification_status": s.verification_status,
                "is_demo_data": s.is_demo_data,
            }
            for s in sources
        ],
        "disclaimer": DISCLAIMER,
        "data_status": DataStatus.AI_GENERATED,
    }


def _infrastructure_for(project_type: str) -> str:
    mapping = {
        "Hospital": "Hospital",
        "Hospital Expansion": "Hospital",
        "Health Centre": "Health Centre",
        "Community Health Centre": "Health Centre",
        "School": "School",
        "Water Supply": "Water Facility",
        "Water Tank": "Water Facility",
        "Reservoir": "Water Facility",
        "Road": "Road",
        "Bridge": "Road",
    }
    return mapping.get(project_type, "Other")


def _executive_summary(project: dict[str, Any], detail: dict[str, Any], risk: dict[str, Any] | None) -> str:
    cost = detail["cost"]
    timeline = detail["timeline"]
    scheme = (detail["scheme"] or {}).get("primary") or {}
    low, high = cost["range_cr"]
    parts = [
        f"{project['name']} is a proposed {project['sector'].lower()} intervention at "
        f"{project['area']} within the Chennai Metropolitan Region. The NIRMAN AI decision "
        f"engines assign it a suitability score of {project.get('suitability_score')}/100 and a "
        f"{project.get('dataset_risk_level', 'Medium')} overall risk classification.",
        f"Planning-level capital outlay is estimated at Rs {cost['estimate_cr']} crore "
        f"(indicative range Rs {low}-{high} crore, including {cost['contingency_pct']}% "
        f"contingency), delivered over {timeline['total_months']} months with a peak labour "
        f"deployment of {timeline['peak_labour']}.",
    ]
    if scheme:
        parts.append(
            f"The most closely aligned funding route in the NIRMAN scheme reference table is "
            f"{scheme.get('scheme_name')} ({scheme.get('ministry')}), matched at "
            f"{scheme.get('match_confidence')}% on project-type eligibility."
        )
    if risk:
        drivers = ", ".join(
            f"{c['label'].lower()} {c['level']}" for c in risk["components"] if c["level"] in ("High", "Very High")
        )
        parts.append(
            f"The locality carries an overall {risk['overall_level']} climate and construction risk "
            f"profile ({risk['overall_score']:.0f}/100)"
            + (f", driven by {drivers}." if drivers else ".")
        )
    parts.append(
        f"Recommendation: {project.get('dataset_recommendation', 'Approve')}. This is an "
        "AI-generated preliminary report for portfolio prioritisation and does not constitute a "
        "sanctioned Detailed Project Report."
    )
    return " ".join(parts)


# -- PDF rendering -------------------------------------------------------


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "NirmanTitle", parent=base["Title"], fontSize=22, leading=26, textColor=BRAND, spaceAfter=2
        ),
        "subtitle": ParagraphStyle(
            "NirmanSubtitle", parent=base["Normal"], fontSize=11, leading=15, textColor=MUTED, spaceAfter=14
        ),
        "h2": ParagraphStyle(
            "NirmanH2",
            parent=base["Heading2"],
            fontSize=13,
            leading=17,
            textColor=BRAND,
            spaceBefore=14,
            spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "NirmanH3", parent=base["Heading3"], fontSize=10.5, leading=14, textColor=INK, spaceBefore=8
        ),
        "body": ParagraphStyle(
            "NirmanBody",
            parent=base["BodyText"],
            fontSize=9.5,
            leading=14,
            textColor=INK,
            alignment=TA_JUSTIFY,
            spaceAfter=6,
        ),
        "small": ParagraphStyle(
            "NirmanSmall", parent=base["BodyText"], fontSize=8, leading=11, textColor=MUTED
        ),
        "cell": ParagraphStyle("NirmanCell", parent=base["BodyText"], fontSize=8.5, leading=11.5),
    }


def _table(rows: list[list[Any]], widths: list[float], styles: dict[str, ParagraphStyle]) -> Table:
    data = [[Paragraph(str(c), styles["cell"]) for c in row] for row in rows]
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
                ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.4, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def _decorate(canvas, doc) -> None:  # noqa: ANN001 - ReportLab callback signature
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(BRAND)
    canvas.rect(0, height - 14 * mm, width, 14 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(18 * mm, height - 9.5 * mm, "NIRMAN AI  |  AI DPR GENERATOR")
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - 18 * mm, height - 9.5 * mm, "Decision-support prototype")

    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(
        18 * mm,
        10 * mm,
        "AI-generated planning report - subject to validation, engineering assessment and statutory approval.",
    )
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def render_pdf(dpr: dict[str, Any]) -> bytes:
    styles = _styles()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title=f"NIRMAN AI DPR - {dpr['project']['name']}",
        author="NIRMAN AI",
    )

    project = dpr["project"]
    cost = dpr["cost"]
    timeline = dpr["timeline"]
    content_width = doc.width

    story: list[Any] = [
        Paragraph("Detailed Project Report", styles["title"]),
        Paragraph(
            f"{project['name']} - {project['area']}, Chennai Metropolitan Region<br/>"
            f"Sector: {project['sector']} | Project code: {project['project_code']} "
            f"| Generated: {dpr['generated_on']}",
            styles["subtitle"],
        ),
        Paragraph("1. Executive Summary", styles["h2"]),
        Paragraph(dpr["executive_summary"], styles["body"]),
    ]

    low, high = cost["range_cr"]
    story += [
        Paragraph("2. Project at a Glance", styles["h2"]),
        _table(
            [
                ["Parameter", "Value", "Produced by"],
                ["Suitability score", f"{project.get('suitability_score')}/100", "Site Suitability Engine / portfolio dataset"],
                ["Recommendation", project.get("dataset_recommendation", "-"), "AI DPR portfolio dataset"],
                ["Risk classification", project.get("dataset_risk_level", "-"), "Risk Engine (rule-based)"],
                ["Estimated outlay", f"Rs {cost['estimate_cr']} crore", "Cost Engine (planning-level)"],
                ["Indicative range", f"Rs {low} - {high} crore", f"Cost Engine, {cost['contingency_pct']}% contingency"],
                ["Duration", f"{timeline['total_months']} months", "Timeline Engine"],
                ["Peak labour", str(timeline["peak_labour"]), "Timeline Engine"],
                ["Machinery", ", ".join(timeline["machinery"]) or "-", "Portfolio dataset"],
            ],
            [content_width * 0.26, content_width * 0.32, content_width * 0.42],
            styles,
        ),
    ]

    story.append(Paragraph("3. Site Analysis", styles["h2"]))
    if dpr["site"]:
        site = dpr["site"]
        story.append(
            _table(
                [
                    ["Attribute", "Value", "Attribute", "Value"],
                    ["Site code", site["site_code"], "Zone", site["zone"] or "-"],
                    ["Coordinates", f"{site['latitude']}, {site['longitude']}", "Land use", site["land_use"] or "-"],
                    [
                        "Population (5 km)",
                        f"{site['population_catchment_5km']:,}" if site["population_catchment_5km"] else "-",
                        "Density",
                        f"{site['population_density']:,}/km2" if site["population_density"] else "-",
                    ],
                    ["Flood risk", site["flood_risk"] or "-", "Terrain", site["terrain_suitability"] or "-"],
                    [
                        "Elevation",
                        f"{site['elevation_m']} m" if site["elevation_m"] else "-",
                        "Slope",
                        f"{site['slope_deg']} deg" if site["slope_deg"] else "-",
                    ],
                    [
                        "Land available",
                        f"{site['land_available_acres']} acres" if site["land_available_acres"] else "-",
                        "Road access",
                        f"{site['distance_major_road_km']} km ({site['road_connectivity']})",
                    ],
                    ["Transit", site["transit_access"] or "-", "Utilities", site["utility_infrastructure"] or "-"],
                ],
                [content_width * 0.18, content_width * 0.32, content_width * 0.18, content_width * 0.32],
                styles,
            )
        )
        story.append(Spacer(1, 4))
        story.append(
            Paragraph(
                "Coordinates are approximate locality centroids added for map display and are not "
                "survey-grade. Site attributes originate from the NIRMAN AI demonstration dataset.",
                styles["small"],
            )
        )
    else:
        story.append(
            Paragraph(
                "No candidate-site record is linked to this project. Site-level analysis requires a "
                "surveyed location to be registered against the project.",
                styles["body"],
            )
        )

    if dpr["explainability"]:
        xai = dpr["explainability"]
        story += [
            Paragraph("4. Suitability &amp; Explainability", styles["h2"]),
            Paragraph(xai["why_this_site"], styles["body"]),
        ]
        rows: list[list[Any]] = [["Factor", "Score /100", "Weight %", "Effect vs baseline", "Basis"]]
        for factor in xai["all_factors"]:
            rows.append(
                [
                    factor["label"],
                    f"{factor['normalized']:.0f}",
                    f"{factor['weight_pct']:.0f}",
                    f"{factor['delta_vs_baseline']:+.1f}",
                    factor["rationale"],
                ]
            )
        story.append(
            _table(
                rows,
                [
                    content_width * 0.22,
                    content_width * 0.10,
                    content_width * 0.10,
                    content_width * 0.14,
                    content_width * 0.44,
                ],
                styles,
            )
        )
        story.append(Spacer(1, 4))
        story.append(
            Paragraph(
                f"Method: {xai['method']}. Contributions are exact weighted deviations from a "
                f"neutral 50/100 baseline of {xai['baseline_score']}.",
                styles["small"],
            )
        )

    story.append(PageBreak())

    story.append(Paragraph("5. Risk Assessment", styles["h2"]))
    if dpr["risk"]:
        risk = dpr["risk"]
        rows = [["Risk component", "Level", "Score /100", "Weight %", "Basis"]]
        for component in risk["components"]:
            rows.append(
                [
                    component["label"],
                    component["level"],
                    f"{component['score']:.0f}",
                    f"{component['weight']:.0f}",
                    component["rationale"],
                ]
            )
        story.append(
            _table(
                rows,
                [
                    content_width * 0.20,
                    content_width * 0.12,
                    content_width * 0.11,
                    content_width * 0.11,
                    content_width * 0.46,
                ],
                styles,
            )
        )
        story.append(Spacer(1, 4))
        story.append(
            Paragraph(
                f"Overall classification: <b>{risk['overall_level']}</b> "
                f"({risk['overall_score']:.0f}/100). " + " ".join(risk["notes"]),
                styles["small"],
            )
        )
    else:
        story.append(
            Paragraph(
                "No climate-risk record matched this locality in the current dataset.", styles["body"]
            )
        )

    story += [
        Paragraph("6. Cost Estimate", styles["h2"]),
        _table(
            [["Component", "Rs crore"]]
            + [[k.replace("_", " ").title(), f"{v}"] for k, v in cost["breakdown_cr"].items()]
            + [["<b>Total (planning-level)</b>", f"<b>{cost['estimate_cr']}</b>"]],
            [content_width * 0.6, content_width * 0.4],
            styles,
        ),
        Spacer(1, 5),
        Paragraph("Assumptions", styles["h3"]),
        Paragraph(
            "<br/>".join(f"&bull; {a}" for a in cost["assumptions"]),
            styles["small"],
        ),
        Spacer(1, 4),
        Paragraph(
            f"Estimate confidence: {cost['confidence']}%. " + " ".join(cost["notes"]),
            styles["small"],
        ),
    ]

    story += [
        Paragraph("7. Timeline, Labour &amp; Machinery", styles["h2"]),
        _table(
            [["Phase", "Starts month", "Duration (months)", "Labour"]]
            + [
                [p["phase"], f"{p['start_month']:.0f}", str(p["duration_months"]), str(p["labour"])]
                for p in timeline["phases"]
            ],
            [content_width * 0.42, content_width * 0.18, content_width * 0.22, content_width * 0.18],
            styles,
        ),
        Spacer(1, 5),
        Paragraph(
            "<br/>".join(f"&bull; {a}" for a in timeline["assumptions"]),
            styles["small"],
        ),
    ]

    story.append(Paragraph("8. Government Scheme Alignment", styles["h2"]))
    scheme = dpr["scheme"]
    if scheme and scheme.get("primary"):
        primary = scheme["primary"]
        story.append(
            _table(
                [
                    ["Field", "Value"],
                    ["Recommended scheme", primary["scheme_name"]],
                    ["Administering ministry", primary.get("ministry") or "-"],
                    ["Match basis", primary["reason"]],
                    ["Match confidence", f"{primary['match_confidence']}%"],
                    ["Source", primary.get("source_url") or "-"],
                    ["Verification status", primary["verification_status"]],
                ],
                [content_width * 0.28, content_width * 0.72],
                styles,
            )
        )
        alternatives = scheme.get("alternatives") or []
        if alternatives:
            story.append(Spacer(1, 4))
            story.append(
                Paragraph(
                    "Alternatives: " + ", ".join(a["scheme_name"] for a in alternatives), styles["small"]
                )
            )
    else:
        story.append(
            Paragraph(
                "Insufficient verified data available: no scheme in the NIRMAN reference table "
                "lists this project type as eligible.",
                styles["body"],
            )
        )
    story.append(Spacer(1, 4))
    story.append(Paragraph(" ".join(scheme.get("notes", [])), styles["small"]))

    story.append(Paragraph("9. Data Sources &amp; Lineage", styles["h2"]))
    story.append(
        _table(
            [["Dataset", "Source", "Verification", "Demo data"]]
            + [
                [s["dataset"], s["source"], s["verification_status"], "Yes" if s["is_demo_data"] else "No"]
                for s in dpr["data_sources"]
            ],
            [content_width * 0.26, content_width * 0.42, content_width * 0.18, content_width * 0.14],
            styles,
        )
    )

    story.append(
        KeepTogether(
            [
                Paragraph("10. Disclaimer", styles["h2"]),
                Paragraph(dpr["disclaimer"], styles["body"]),
                Paragraph(
                    "Suitability scores, timelines, resource estimates, budgets and risk "
                    "classifications are model-derived approximations based on the input dataset. "
                    "They must be validated through ground survey, detailed engineering study and "
                    "statutory clearance before any financial or contractual commitment. Final "
                    "sanction remains subject to the respective scheme guidelines and the competent "
                    "authority.",
                    styles["body"],
                ),
            ]
        )
    )

    doc.build(story, onFirstPage=_decorate, onLaterPages=_decorate)
    return buffer.getvalue()
