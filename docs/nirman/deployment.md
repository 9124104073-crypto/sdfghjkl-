# Deploying NIRMAN AI — one shareable link with the real backend

The deployed image serves the React frontend **and** the Python API from a
single service, so you get one URL, no CORS configuration, and no separate
database to provision.

```
https://your-app.onrender.com/            → the React app
https://your-app.onrender.com/api/v1/...  → the FastAPI API
https://your-app.onrender.com/docs        → interactive API docs
https://your-app.onrender.com/health      → status and seed verification
```

## Why no database service is needed

Free hosting tiers give you an ephemeral filesystem: anything written is lost
when the instance restarts. That is normally a problem — here it is not. The
seed loader rebuilds the entire database from `database/seed/` on every start,
so the service is always in a known-good demonstration state. Restarts simply
reset the demo, which is what you want when sharing a link.

Moving to a persistent PostgreSQL + PostGIS database later is two uncommented
blocks in `render.yaml` plus a `DATABASE_URL` — no application code changes.

---

## Option A — Render (recommended)

Render can build the Dockerfile directly from a Git repository. Free tier, no
credit card.

**1. Put the repository on GitHub**

```bash
git remote add origin https://github.com/<your-username>/nirman-ai.git
git push -u origin main
```

**2. Create the service**

- Sign in at <https://render.com> (GitHub sign-in is easiest).
- **New → Blueprint**, then select the repository.
- Render reads `render.yaml` and configures everything. Click **Apply**.

If you would rather not use the blueprint, use **New → Web Service** instead and set:

| Field | Value |
| --- | --- |
| Runtime | Docker |
| Dockerfile path | `./docker/allinone.Dockerfile` |
| Docker context | `.` |
| Health check path | `/health` |
| Instance type | Free |

**3. Wait for the first build**

The image builds the frontend with Node and then installs the Python
dependencies, so the first deploy takes roughly 5–8 minutes. Later deploys are
faster.

**4. Share the URL**

Render gives you `https://<name>.onrender.com`. That is the link to send.

> **Free-tier sleep:** the instance spins down after about 15 minutes of
> inactivity and takes 30–60 seconds to wake on the next request. Warn whoever
> you share it with, or upgrade the instance if that matters.

---

## Option B — Any Docker host

The same image runs anywhere that accepts a Dockerfile — Railway, Fly.io,
Google Cloud Run, an ordinary VPS:

```bash
docker build -f docker/allinone.Dockerfile -t nirman-ai .
docker run -p 8000:8000 nirman-ai
```

Then open <http://localhost:8000>. The container reads `$PORT` if the host
injects one, which is what Render, Railway and Cloud Run all do.

---

## Option C — Split frontend and backend

Only worth it if you specifically want Vercel's CDN for the frontend.

1. **Backend** on Render using `docker/backend.Dockerfile` (API only).
2. **Frontend** on Vercel: root directory `frontend`, build `npm run build`,
   output `dist`.
3. Set `VITE_API_BASE_URL` in Vercel to the Render URL.
4. Set `CORS_ORIGINS` on Render to the Vercel URL — **required**, or the browser
   will block every request.

The single-origin option exists precisely to avoid step 4 going wrong.

---

## Running the deployed configuration locally

Verify exactly what will be deployed, without Docker:

```bash
cd frontend && npm run build && cd ..
cd backend
STATIC_FILES_DIR="../frontend/dist" python -m uvicorn app.main:app --port 8000
```

Open <http://localhost:8000>. One origin, real backend, real data — identical
to production.

## Routing rules

The static mount is added *after* every API route, and unknown paths fall
through to `index.html` so client-side routes survive a hard refresh. Paths
under `api`, `health`, `docs`, `redoc` and `openapi.json` are excluded from
that fallback: a mistyped endpoint returns a real 404 instead of quietly
answering with HTML. `backend/tests/test_single_origin.py` pins this
behaviour.

## Environment variables

Everything has a working default; none are required for the demo.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | 8000 | injected by the host |
| `STATIC_FILES_DIR` | set in the image | serves the bundled frontend |
| `DEMO_MODE` | `true` | seeded data, simulated IoT, mock Copilot |
| `AUTO_SEED` | `true` | rebuild the database on start |
| `AI_PROVIDER` | `mock` | `mock`, `local` or `hosted` |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | unset | only for `local`/`hosted` |
| `DATABASE_URL` | SQLite | set to promote to PostgreSQL/PostGIS |
| `CORS_ORIGINS` | localhost | leave empty for single-origin |
| `JWT_SECRET` | placeholder | Render generates one via `render.yaml` |

Never commit real keys. `render.yaml` uses `generateValue` for the secret and
leaves every LLM variable unset.

## A note on the local LLM

Do not deploy a self-hosted model to a free tier — it will not fit. Keep
`AI_PROVIDER=mock` in the cloud; the Copilot is fully functional that way
because it only ever explains structured engine output. Run the local model on
your own machine when you want to demo that path.
