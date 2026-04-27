# ── Stage 1: Build React frontend ──────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build || (echo "=== BUILD FAILED ===" && cat /tmp/build.log 2>/dev/null; exit 1)


# ── Stage 2: Python backend + serve built frontend ─────────────────────────
FROM python:3.12-slim AS app

# System deps for geopandas / fiona / shapely
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgdal-dev \
      gdal-bin \
      libspatialindex-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Persist Natural Earth data across container restarts
VOLUME ["/app/data"]

EXPOSE 8000
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
