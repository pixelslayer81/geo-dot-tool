# ── Stage 1: Build React frontend ──────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ── Stage 2: Python backend + serve built frontend ─────────────────────────
FROM python:3.12-slim AS app

# System deps for geopandas / fiona / shapely
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgdal-dev \
      gdal-bin \
      libspatialindex-dev \
      wget \
      unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Natural Earth data at build time so the container starts instantly
RUN mkdir -p /app/data/natural_earth && \
    wget -q -O /app/data/natural_earth/ne_50m_admin_0_countries.zip \
      "https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip" && \
    unzip -q /app/data/natural_earth/ne_50m_admin_0_countries.zip \
      -d /app/data/natural_earth && \
    rm /app/data/natural_earth/ne_50m_admin_0_countries.zip

COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8000
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
