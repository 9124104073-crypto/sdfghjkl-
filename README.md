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
| **Data & Lineage** | Registry, provenance chain and provider connection status |

## Stack

React 19 · Vite · Tailwind CSS 4 · Leaflet · Recharts · Axios ·
FastAPI · Pydantic · SQLAlchemy 2 · ReportLab ·
PostgreSQL + PostGIS + pgvector (SQLite for local development) ·
ESP32 + MQTT · Docker

Everything used is open source or free tier.

## Project layout

```
backend/
  app/
    api/v1/        REST routers
    core/          config, database, constants, migrations
    engines/       all scoring, ranking and costing logic
    models/        SQLAlchemy models
    providers/ai/  MockAIProvider, LocalLLMProvider, HostedLLMProvider
    providers/data/ DemoDataProvider + declared GCC/CMDA/OSM/Bhuvan/IMD/Census
    repositories/  the only place SQL happens
    schemas/       Pydantic request/response contracts
    seed/          seed loader
    services/      orchestration, DPR generator, Copilot, IoT
  tests/           70 tests
database/
  seed/            replaceable CSV/JSON datasets
  migrations/      PostGIS and pgvector migrations
frontend/src/
  api/             axios client
  components/      layout, map, shared UI
  pages/           twelve feature pages
docker/            Dockerfiles and nginx config
docs/nirman/       architecture, API, demo script, ESP32 guide
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

## Deployment

- **Frontend** — Vercel. Build `npm run build`, output `dist/`, set
  `VITE_API_BASE_URL` to the backend origin.
- **Backend** — Render or any free-tier container host, using
  `docker/backend.Dockerfile`.
- **Database** — any PostgreSQL 16 + PostGIS service.
- **Local LLM** stays on the demo machine; do not deploy it to a free tier.
  Hosted inference is optional — `AI_PROVIDER=mock` keeps everything working.
