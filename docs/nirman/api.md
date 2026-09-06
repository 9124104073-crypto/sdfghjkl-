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
