# NIRMAN AI — API contract

Base path `/api/v1`. Interactive docs at `/docs`, schema at `/openapi.json`.

List responses use an envelope carrying provenance:

```json
{
  "data": [...],
  "count": 40,
  "data_status": "demo",
  "is_demo_data": true,
  "notes": ["Demonstration data — requires validation before real-world use."],
  "disclaimer": "NIRMAN AI is a decision-support prototype. ..."
}
```

Engine responses return their own shape, always including `data_status` and
`notes`.

## System

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | status, database connectivity, version, seed state, record counts |
| GET | `/` | service metadata and disclaimer |

## Sites

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/sites` | all candidate sites (`?zone=`) |
| GET | `/sites/{id}` | full detail: attributes, risk, demand, suitability, gaps |
| GET | `/sites/{id}/explain` | explainable breakdown (`?infrastructure_type=`) |
| GET | `/sites/recommended` | top-N ranked (`?infrastructure_type=&limit=&zone=&max_flood_risk=`) |
| POST | `/sites/recommended` | as above with custom `weights` |
| GET | `/sites/infrastructure-types` | supported facility types |
| GET | `/sites/mcda` | published 30-site MCDA scorecard |

```bash
curl -X POST http://localhost:8000/api/v1/sites/recommended \
  -H "Content-Type: application/json" \
  -d '{"infrastructure_type":"Hospital","limit":5,
       "weights":{"population_coverage":30,"accessibility":15,"flood_safety":20,
                  "land_suitability":10,"infrastructure_gap":10,"terrain":5,
                  "water_availability":4,"electricity_availability":3,
                  "existing_facility_distance":3}}'
```

## Priority, What-If, Risk, Demand

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/priority-projects` | ranking, optionally with `weights`, `sector`, `limit` |
| GET | `/priority-projects/weights` | default priority weights |
| GET | `/what-if/areas` | baseline parameter scores for 45 areas |
| GET | `/what-if/weights` | default what-if weights |
| POST | `/what-if/simulate` | re-rank under `weights`; returns before/after, movers, explanation |
| GET | `/risk` | risk classification per locality, with coordinates for mapping |
| GET | `/population` | projections, growth and demand scores |

## Projects, cost, DPR

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/projects` | portfolio and summary (`?sector=`) |
| GET | `/projects/{id}` | detail with cost, timeline, scheme and risks |
| POST | `/cost/estimate` | ad-hoc planning-level estimate |
| GET | `/cost/project-types` | project types with an indicative base rate |
| GET | `/dpr/projects` | projects available for DPR generation |
| POST | `/dpr/{id}/generate` | DPR as structured JSON |
| GET | `/dpr/{id}/download` | DPR as a PDF attachment |

## Schemes and GIS

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/schemes` | reference table and project mappings |
| GET | `/schemes/recommend` | match a `project_type` (and optional `project_name`) |
| GET | `/gis/layers` | map layers grouped by asset type, plus sites |

## IoT

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/iot/devices` | fleet status, readings, trends, thresholds |
| POST | `/iot/simulate` | generate demonstration readings (`escalate` drives thresholds) |
| POST | `/iot/ingest` | store one reading — the payload an ESP32 publishes |

## Copilot

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/copilot/query` | `{question, project_id?, site_id?, context?}` → answer, sources, supporting data, actions, `data_status` |
| GET | `/copilot/suggestions` | suggested questions |

## Data governance

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/data-sources` | data-source registry |
| GET | `/data-sources/lineage` | metric → source → processing → engine → output |
| GET | `/data-sources/providers` | declared providers and connection status |

## Dashboard

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/dashboard` | portfolio rollup for the landing page |
| GET | `/dashboard/weights` | default site-suitability weights |

## Errors

| Status | Meaning |
| --- | --- |
| 404 | site, project or device not found |
| 422 | invalid input; weights that do not total 100 return `{"error": "invalid_weights"}` |
| 500 | seed failure returns `{"error": "seed_error"}` |

The application degrades rather than failing when the LLM or MQTT broker is
unavailable: the Copilot falls back to `MockAIProvider` and the IoT page serves
stored readings.

---

## Machine learning and explainability

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/ml/providers` | available scoring providers (`mcda` default, `ml` opt-in) |
| GET | `/ml/model` | model metrics and global SHAP importance |
| GET | `/ml/sites/{id}/explain` | SHAP explanation for one site |
| GET | `/ml/sites/ranked` | rank with `?provider=mcda\|ml` |

Returns `503` when the model cannot be fitted. The `/ml/sites/ranked` endpoint
degrades to MCDA and says so in `notes` rather than failing.

## Geospatial

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/spatial/summary` | extent, centroid, convex-hull area |
| GET | `/spatial/neighbours` | nearest candidate sites in kilometres |
| GET | `/spatial/catchments` | buffer analysis and catchment overlap (`?radius_km=`) |
| GET | `/spatial/coverage-gaps` | localities outside every site catchment |

Distances and areas are computed in EPSG:32644 (UTM 44N), not in degrees.

## Knowledge base

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/knowledge/search` | semantic search (`?q=` , `?top_k=`) |
| GET | `/knowledge/stats` | corpus size and embedding configuration |
| POST | `/knowledge/reindex` | rebuild corpus and embeddings |

## History and audit

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/history/site-scores` | persisted scoring runs (`?site_id=`) |
| GET | `/history/ai-recommendations` | persisted AI and engine outputs |
| GET | `/history/audit-log` | audit trail |

## IoT

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/iot/mqtt-status` | subscriber state, message and rejection counts |

## Unversioned paths

The build plan documents endpoints without a version (`/api/sites`,
`/api/risk`, `/api/copilot/query`, `/api/iot/simulate`, …). Those paths all
work: `/api/{path}` issues a `307` to `/api/v1/{path}`, which preserves the
method and body so `POST` still works. There is one implementation, not two.
`/api` itself returns service metadata, and an unknown unversioned path still
returns a real `404`.
