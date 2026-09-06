# NIRMAN AI — demo script

A 19-step run through the platform. Total time about six minutes.

**Open with the framing:** NIRMAN AI is a decision-support prototype for
Chennai's public infrastructure. It tells a planner *where* to build, *why* that
location, what it costs, what could go wrong, and which scheme could fund it —
and it never pretends its demonstration data is verified government
measurement.

| # | Step | What to point at |
| --- | --- | --- |
| 1 | **Dashboard** | 40 sites assessed, 40 projects, ₹1,641 Cr indicative outlay, 14 high-risk localities. The "Demo mode" chip in the header is deliberate. |
| 2 | **Site Recommendation → Hospital** | The engine ranks all 40 candidates. Nothing here came from a language model. |
| 3 | **Map** | Top candidates plotted on OpenStreetMap, coloured by recommendation tier. |
| 4 | **Top 5 table** | Score, confidence, population, flood risk and tier for each. |
| 5 | **Click the leading site** | Selection drives the explainability panel. |
| 6 | **"Why this site?"** | Baseline 50 → factor effect → final score, with every factor's contribution. |
| 7 | **Positive / negative factors** | Each carries its own rationale: population served, road distance, flood rating. |
| 8 | **Switch to School** | The ranking changes — land requirement and service gap differ by facility type. |
| 9 | **What-If Simulator** | Note the baseline notice: at equal weights nothing has moved. |
| 10 | **Preset "Climate resilience first"** | Flood safety to 40%. |
| 11 | **Ranking change** | Pallikaranai to #1, Mudichur +12 places, OMR drops. Recalculated by the backend, not the browser. |
| 12 | **Priority Ranking** | 40 projects re-ranked on impact, urgency, population benefit, risk, gap and feasibility. Move a slider and watch it re-rank. |
| 13 | **Cost & Construction** | Pick Ambattur Government Hospital: ₹120 Cr with an explicit range, a component breakdown, and a phase-by-phase programme. |
| 14 | **Assumptions block** | "Not an approved government cost" is in the payload, not just the UI. |
| 15 | **Government Schemes** | Look up "Drainage" → AMRUT 2.0, with ministry, eligibility basis and `pending_verification` status. The LLM cannot name a scheme. |
| 16 | **AI DPR → Analyse** | Executive summary, site analysis, explainability table, risk, cost, timeline, scheme, data sources, disclaimer. |
| 17 | **Download PDF** | A four-page report with the same figures and the disclaimer on the page. |
| 18 | **IoT Monitoring → "Simulate rising level"** | Click two or three times on the Pallikaranai water-level sensor: NORMAL → WARNING. Thresholds are demonstration rules, not a flood forecast. |
| 19 | **Copilot** | Ask *"What is the flood risk in Pallikaranai?"* — the answer cites the risk engine **and** the live sensor reading, with sources and verification status attached. |

**Close on Data & Lineage:** every metric traces source → processing → engine →
output; the registry shows what is demonstration data and what is pending
verification; and the provider list shows exactly which authoritative sources
(GCC, CMDA, OSM, Bhuvan, IMD, Census) would replace the demo data, without a
frontend change.

## Questions the Copilot answers

- Which area is best for a new hospital?
- Why is this site recommended?
- What happens if flood safety becomes the highest priority?
- Which projects should be prioritised for a budget of 300 crore?
- Which government scheme is relevant for a storm water drain?
- What is the flood risk in Pallikaranai?
- Generate a preliminary project summary for Ambattur.

Asking something outside the data — *"Which scheme funds an orbital launch
pad?"* — returns **"Insufficient verified data available."** That refusal is the
feature, not a gap.

## Reset between runs

The IoT simulator accumulates readings. To return every device to NORMAL:

```bash
curl -X POST http://localhost:8000/api/v1/iot/simulate \
  -H "Content-Type: application/json" \
  -d '{"readings":6,"escalate":-0.8}'
```

To reload every dataset from scratch:

```bash
cd backend && python -c "from app.core.database import SessionLocal; from app.seed import loader; db=SessionLocal(); print(loader.seed_all(db, force=True))"
```
