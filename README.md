# NIRMAN AI

**AI-powered public-infrastructure decision support for the Chennai Metropolitan Area.**

NIRMAN AI helps planners decide *where* infrastructure should be built, *why* a
location is suitable, what is urgently needed, what the risks are, roughly what
it costs and how long it takes, which government scheme could fund it, and what
happens when priorities change — with natural-language assistance and live
sensor input on top.

> **NIRMAN AI is a decision-support prototype.** Demonstration datasets and
> AI-generated estimates require validation against authoritative data,
> engineering assessment and statutory approvals before real-world use. It does
> not replace engineers, planners, government authorities or statutory approval
> processes.

The Chennai datasets shipped here are **demonstration/synthetic values**. They
must not be presented as verified government measurements. Every API response
declares whether a value is `demo`, `source`, `derived` or `ai_generated`.

---

## Quick start

No Docker and no database server required — SQLite and seeded demo data are the
default.

**Backend** (Python 3.11+):

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

The API comes up on <http://localhost:8000> — docs at `/docs`, health at
`/health`. The schema is created and all 14 datasets are seeded on first start.

**Frontend** (Node 20+), in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server proxies `/api` to the backend, so
no CORS configuration is needed locally.

**Tests:**

```bash
cd backend && python -m pytest tests -q
```

### With Docker

```bash
cp .env.example .env
docker compose up --build
```

Frontend on <http://localhost:8080>, API on <http://localhost:8000>, PostGIS on
5432. Add the optional MQTT broker with `docker compose --profile iot up -d mqtt`.

---

## Features

| Page | What it does |
| --- | --- |
| **Dashboard** | Portfolio rollup — sites, projects, outlay, high-risk areas, sensor alerts |
| **Infrastructure Map** | Leaflet/OSM map with site, risk and existing-facility layers |
| **Site Recommendation** | Ranks 40 candidate localities per facility type |
| **Explainable AI** | Why a site scored what it did, factor by factor |
| **Priority Ranking** | Re-ranks 40 projects on six configurable factors |
| **Risk & Climate** | Flood, terrain, accessibility and construction-delay classification |
| **What-If Simulator** | Move five weights, backend re-ranks 45 areas, shows what moved |
| **Cost & Construction** | Planning-level estimates with ranges, breakdowns and phase plans |
| **Government Schemes** | Project type → eligible Central scheme, with source and status |
| **AI DPR** | Full Detailed Project Report on screen and as a PDF |
| **NIRMAN Copilot** | Natural-language answers built strictly from engine output |
| **IoT Monitoring** | Simulated ESP32 fleet feeding the Risk engine |
| **Infrastructure Explorer** | Filterable inventory of localities, facilities and spatial analysis |
| **Knowledge Base** | Semantic search over methodology, schemes and provenance; AI/audit history |
| **Data & Lineage** | Registry, provenance chain and provider connection status |

## Stack

**Frontend** React 19 · Vite · Tailwind CSS 4 · Leaflet · Recharts · Axios · Vitest
**Backend** FastAPI · Pydantic · SQLAlchemy 2 · ReportLab
**Data** Pandas · NumPy
**ML** scikit-learn · XGBoost · SHAP
**GIS** GeoPandas · Shapely · PostGIS
**Storage** PostgreSQL + PostGIS + pgvector (SQLite for local development)
**IoT** ESP32 · MQTT (paho) · **Deploy** Docker

Everything used is open source or free tier.

## Project layout

```
backend/
  app/
    api/v1/        REST routers
    core/          config, database, constants, migrations
    engines/       all scoring, ranking and costing logic (incl. ml.py + SHAP)
    models/        SQLAlchemy models
    providers/ai/  MockAIProvider, LocalLLMProvider, HostedLLMProvider
    providers/data/ DemoDataProvider + declared GCC/CMDA/OSM/Bhuvan/IMD/Census
    providers/recommendation/  MCDA (default) and ML+SHAP scoring strategies
    repositories/  the only place SQL happens
    schemas/       Pydantic request/response contracts
    seed/          seed loader
    services/      orchestration, DPR, Copilot, IoT, GIS, RAG, MQTT, persistence
  tests/           106 tests
database/
  seed/            replaceable CSV/JSON datasets
  migrations/      PostGIS and pgvector migrations
frontend/src/
  api/             axios client
  components/      layout, map, shared UI
  pages/           fourteen feature pages
  test/            23 component tests
docker/            Dockerfiles and nginx config
docs/nirman/       architecture, API, demo script, deployment, ESP32 guide
```

## Design rules

1. Demonstration values are never presented as official Chennai measurements.
2. Datasets are not hard-coded into React — they live in `database/seed/` and
   are replaceable without touching frontend code.
3. The frontend never talks to the database or to an LLM vendor.
4. The LLM is not responsible for deterministic site scoring.
5. The LLM cannot invent government schemes, costs, coordinates or regulations —
   the scheme engine may only select from the reference table.
6. Source metadata and data lineage are preserved end to end.
7. IoT is a sensor input to the Risk engine, not a decision engine.
8. The Copilot provider is replaceable via `AI_PROVIDER`.
9. Demo mode keeps working when the LLM and MQTT are both unavailable.
10. Cost and risk outputs are planning-level decision support, not statutory or
    engineering approval.
11. The machine-learned scorer is opt-in and clearly labelled illustrative; the
    deterministic engine is always the scorer of record.

## Machine learning and explainability

Two scoring strategies sit behind one `RecommendationProvider` interface:

| Provider | What it is | Status |
| --- | --- | --- |
| `mcda` | Deterministic weighted multi-criteria analysis | **Default.** Reproducible, needs no training data |
| `ml` | XGBoost regressor explained with SHAP | Opt-in, illustrative only |

The model learns to reproduce the demonstration dataset's published score from
measurable site attributes (cross-validated R² ≈ 0.79, MAE ≈ 1.0 on 40 rows).
**Forty rows cannot support a generalisable model** — it demonstrates the ML and
SHAP pathway, and every response says so. SHAP contributions are additive: base
value plus all contributions equals the prediction, which the test suite pins.

An ML failure degrades to MCDA rather than propagating an error, so the MVP
never depends on a model for core scoring.

## Geospatial analysis

Coordinates are stored as portable latitude/longitude so the project runs on
SQLite, but the spatial reasoning is done properly with GeoPandas and Shapely in
a projected CRS (EPSG:32644, UTM 44N) — so a "5 km catchment" is genuinely 5 km:

- nearest-neighbour distances between candidate sites, in kilometres
- 5 km buffers with catchment-overlap detection (which sites compete for the
  same population)
- coverage gaps: localities appearing in the risk, priority and population
  datasets with no candidate site within reach

## Knowledge base (RAG)

Retrieval runs over what the platform can actually vouch for: its own
methodology, the scheme reference table and the data registry. Embeddings are a
deterministic offline TF-IDF projection, so retrieval is reproducible and needs
no LLM, API key or network. Vectors live in a `vector(N)` column on PostgreSQL
via pgvector, and as JSON on SQLite.

The Copilot attaches retrieved passages to its answers as citations — retrieval
supplements the engine results, it never replaces them.

## Datasets

All under `database/seed/`, all demonstration data unless noted.

| Dataset | Records | Notes |
| --- | --- | --- |
| `hospital_sites/` | 40 | Candidate localities with component scores. Coordinates are approximate centroids for map display. |
| `mcda_sites/` | 30 | Published MCDA scorecard (30/20/20/15/15) |
| `priority_projects/` | 40 | Impact ranking; sector labels derived and reconciled against the source report's sector averages |
| `what_if/` | 45 | Five parameters per area |
| `risk_data/` | 30 | Flood, rainfall, terrain, accessibility, delay |
| `population_data/` | 30 | 2026 estimates, projections to 2045 |
| `dpr_projects/` | 40 | Suitability, timeline, labour, machinery, budget, risk |
| `government_schemes/` | 20 + 40 | Scheme reference table and project mappings. Scheme names are real programmes; portal URLs are marked `pending_verification`. |
| `gis_reference/` | 59 | Locality centroids, plus a facility layer pack whose coordinates are in the **Coimbatore** region — tagged as a separate study area so it never mixes with Chennai analytics |

To use real data, replace a seed file and re-seed. No code changes are needed.
`/api/v1/data-sources/providers` lists the authoritative sources (Greater
Chennai Corporation, CMDA, OpenStreetMap, ISRO Bhuvan, IMD, Census of India)
that are declared but not yet connected.

## Configuration

Copy `.env.example` to `.env`. Nothing sensitive is committed; no API key
appears in source.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | SQLite file | PostgreSQL/PostGIS in Docker |
| `CORS_ORIGINS` | localhost:5173 | comma-separated origins |
| `DEMO_MODE` | `true` | seeded data, simulated IoT, mock Copilot |
| `AUTO_SEED` | `true` | seed on startup if the database is empty |
| `AI_PROVIDER` | `mock` | `mock`, `local` or `hosted` |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | unset | OpenAI-compatible endpoint |
| `MQTT_BROKER_URL` | unset | optional broker |
| `JWT_SECRET` | placeholder | change in production |

## Documentation

- [Architecture](docs/nirman/architecture.md) — layering, engines, scoring, Copilot
- [API contract](docs/nirman/api.md) — every endpoint
- [Demo script](docs/nirman/demo-script.md) — the 19-step walkthrough
- [ESP32 / IoT](docs/nirman/iot-esp32.md) — message contract and reference sketch
- [Deployment](docs/nirman/deployment.md) — getting a shareable link with the real backend

## Deployment — one link, real backend

The deployment image serves the React frontend **and** the FastAPI API from a
single origin, so one URL gives you the whole working application:

```
https://your-app.onrender.com/        → the React app
https://your-app.onrender.com/api/v1  → the API
https://your-app.onrender.com/docs    → interactive API docs
```

Push to GitHub, then on Render choose **New → Blueprint** and select the repo —
`render.yaml` configures the rest. Free tier, no database add-on required: the
seed loader rebuilds the database from `database/seed/` on every start, so an
ephemeral filesystem is an advantage rather than a problem.

Run exactly that configuration locally:

```bash
cd frontend && npm run build && cd ../backend
STATIC_FILES_DIR="../frontend/dist" python -m uvicorn app.main:app --port 8000
```

Full instructions, including the split Vercel + Render option and the move to
persistent PostgreSQL + PostGIS, are in
[docs/nirman/deployment.md](docs/nirman/deployment.md).

Do not deploy a self-hosted LLM to a free tier. `AI_PROVIDER=mock` keeps the
Copilot fully functional, because it only ever explains structured engine
output.
