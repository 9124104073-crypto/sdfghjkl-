# Single-origin image: builds the React frontend, then serves it from the
# FastAPI service alongside the API. One container, one URL, no CORS.

# --- stage 1: build the frontend ---
FROM node:22-alpine AS web

WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Empty base URL: the API is same-origin in this image.
ENV VITE_API_BASE_URL=""
RUN npm run build


# --- stage 2: serve API + frontend ---
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_FILES_DIR=/app/static

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY database ./database
COPY --from=web /web/dist ./static

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD curl -fsS http://localhost:${PORT:-8000}/health || exit 1

# Render (and most PaaS hosts) inject $PORT.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
