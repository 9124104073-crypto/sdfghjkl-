# NIRMAN AI — Architecture

## Product position

NIRMAN AI is a **decision-support system**. It does not replace engineers,
planners, government authorities or statutory approval processes. Every output
is planning-level advice that must be validated before it informs a real
decision.

## Layering

```
React frontend
      │  HTTP/JSON only
      ▼
FastAPI REST API              app/api/v1/routers.py
      ▼
Service layer                 app/services/        orchestration, no scoring maths
      ▼
Decision engines              app/engines/         all scoring, ranking, costing
      ▼
Repositories                  app/repositories/    the only place SQL happens
      ▼
Data providers                app/providers/data/  demo today, GCC/CMDA/OSM/... later
      ▼
PostgreSQL + PostGIS (+ pgvector)
```

Two rules hold this together:

1. **The frontend implements no decision logic.** It renders what the API
   returns. Change a weight, and the browser posts it to the backend and waits.
2. **The LLM is not in the scoring path.** Site scores, costs, schemes, risk
   classes and rankings are produced by deterministic engines. A language model
   may only *explain* results those engines produced.

## The four kinds of value

Every dataset and every API response distinguishes:

| `data_status` | Meaning |
| --- | --- |
| `demo` | Demonstration / synthetic value supplied with the project |
| `source` | Value as published by an external source |
| `derived` | Computed by a NIRMAN engine from the above |
| `ai_generated` | Written by the Copilot or the DPR generator |

Every important table also carries `source_name`, `source_url`, `source_type`,
`source_date`, `verification_status` and `is_demo_data`. The `data_sources`
table is the registry, and `/api/v1/data-sources/lineage` publishes the chain
*metric → source → processing → engine → output*.

**The Chennai datasets shipped with this project are demonstration data.** They
must not be presented as verified government measurements.

## Decision engines

| Engine | File | Produces |
| --- | --- | --- |
| Site suitability | `engines/suitability.py` | score, confidence, tier, factor contributions |
| Explainability | `engines/explain.py` | signed contributions vs a neutral baseline |
| Priority | `engines/priority.py` | re-ranked project portfolio |
| Risk | `engines/risk.py` | flood / terrain / access / delay classification |
| Demand | `engines/demand.py` | growth, CAGR, demand score |
| Cost & timeline | `engines/cost.py` | estimate range, breakdown, phase plan |
| What-If | `engines/whatif.py` | before/after ranking under new weights |
| Schemes | `engines/schemes.py` | eligible Central schemes from the reference table |

### Weighting

Weights are percentages that must total 100. `engines/weights.py` validates keys
and ranges, rejects a total that is not 100 (±0.5), then normalises so
contributions add up exactly. An invalid set returns HTTP 422 with
`error: invalid_weights` — the engine never silently "fixes" the numbers.

### Site scoring and recommendation tiers

Nine factors — population coverage, accessibility, flood safety, land
suitability, infrastructure gap, terrain, water, electricity and distance from
existing facilities — are normalised to 0–100 and weighted.

| Score | Tier |
| --- | --- |
| 83–100 | Recommended |
| 75–82 | Consider |
| 70–74 | Further Assessment Required |
| below 70 | Not Recommended |

Two normalisation modes are used deliberately:

- **Categorical factors** (flood risk, terrain, utilities) use absolute ordinal
  scores, because "Low flood risk" means the same thing everywhere.
- **Continuous factors** (population, accessibility, land, service gap, distance
  from existing facilities) are normalised **relative to the assessed candidate
  set**. Site selection is comparative — "the best available location for this
  facility" — and this keeps scores spread across the tiers instead of bunching
  in the middle. A factor whose values barely vary is left on its absolute scale
  so a near-uniform attribute is never amplified into a false differentiator.

Land availability is scored against **what the facility needs**, not a fixed
acreage: a compact 4-acre central plot is adequate for a health centre and tight
for a hospital, and the engine reflects that.

Because the continuous factors are set-relative, a site's score depends on the
candidate set it is compared against. The API always calibrates against the full
site list, so a score on a detail page matches the same site's score in the
ranked list.

### Explainability

For deterministic MCDA the attribution is exactly known, so NIRMAN reports true
weighted contributions rather than an approximation: each factor's deviation
from a neutral 50/100 baseline, times its weight. The response shape is the one
a SHAP explainer would fill in for a machine-learned model, so introducing a
model later needs no frontend change.

### Cost

Planning-level only, never described as an approved government cost. When a
project carries a portfolio budget, that figure is treated as the **all-in
total** and decomposed into components (contingency included) — the engine
supplies the uncertainty band rather than inflating a number that already
represents the whole project. Without a known budget, an indicative base rate is
scaled and contingency is added on top. Risk class drives the contingency band:
Low 8%, Medium 12%, High 18%, Very High 24%.

## Copilot

```
question → intent detection → NIRMAN decision engines → database/GIS/risk/cost
        → provider explains the structured result → sourced answer
```

`AIProvider` has three implementations selected by `AI_PROVIDER`:

- `mock` — `MockAIProvider`, template-driven and always available. The hackathon
  demo works fully with no LLM configured.
- `local` — self-hosted OpenAI-compatible endpoint (llama.cpp, Ollama, vLLM).
- `hosted` — hosted inference API; the key comes from the environment only.

Both LLM providers fall back to the mock provider if the endpoint is
unreachable, so the demo cannot break because a model is down. The frontend
never learns which provider answered.

The provider receives a hard contract: use only the supplied structured context;
never invent a score, cost, scheme, coordinate, population figure or regulation;
and if the context lacks what is needed, reply *"Insufficient verified data
available."*

## Data providers (real-data readiness)

`providers/data/` declares `DemoDataProvider` (active) alongside `GCC`, `CMDA`,
`OSM`, `Bhuvan`, `IMD` and `Census` providers, each carrying its organisation,
licence, scope, update frequency and connection status. An unconnected provider
returns nothing rather than an approximation — NIRMAN AI does not scrape and
does not fabricate a value to fill a gap.

## Database portability

The application targets PostgreSQL + PostGIS but runs on SQLite with no
external services, so `git clone` to a working demo needs no infrastructure.
Coordinates are stored as plain `latitude`/`longitude` columns everywhere;
`database/migrations/002_spatial_and_indexes.sql` promotes them to real
`geometry(Point, 4326)` columns with GiST indexes on PostgreSQL, and `003`
promotes RAG embeddings to a `vector` column. Because those migrations need the
tables to exist, they are applied at application startup rather than by the
image's init hook (which only creates the extensions).

## Regional data hygiene

The GIS layer pack supplied with the project (wards, hospitals, schools, water
bodies, elevation) has coordinates in the **Coimbatore** region, not Chennai. It
is loaded under `region = "Coimbatore study box (Tamil Nadu)"` so the schema can
be exercised end to end without contaminating Chennai analytics, and a test
asserts the two never mix.
