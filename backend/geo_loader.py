"""
Geographic shape loader.

Downloads Natural Earth 50m data on first use, then rasterizes named
shapes (continents, regions, countries) into binary numpy masks.
"""

import re
import unicodedata
import zipfile
from pathlib import Path
from typing import Optional

import geopandas as gpd
import numpy as np
import requests
from PIL import Image, ImageDraw


def _name_to_slug(name: str) -> str:
    """Convert a country name to a safe shape ID, e.g. 'Côte d\\'Ivoire' → 'cote_divoire'."""
    nfkd = unicodedata.normalize('NFKD', name)
    ascii_str = nfkd.encode('ascii', 'ignore').decode('ascii')
    slug = re.sub(r'[^a-z0-9]+', '_', ascii_str.lower().strip()).strip('_')
    return slug


def _extract_polygons(geom) -> list:
    """Extract all Polygon geometries from a shape, sorted by area descending."""
    if geom is None:
        return []
    gtype = geom.geom_type
    if gtype == 'Polygon':
        return [geom]
    if gtype == 'MultiPolygon':
        return sorted(geom.geoms, key=lambda p: p.area, reverse=True)
    if gtype == 'GeometryCollection':
        polys = []
        for g in geom.geoms:
            polys.extend(_extract_polygons(g))
        return sorted(polys, key=lambda p: p.area, reverse=True)
    return []

RUSSIA_SPLIT_LON = 60.0  # Ural Mountains — west/east split longitude

DATA_DIR = Path(__file__).parent.parent / "data" / "natural_earth"
COUNTRIES_SHP = DATA_DIR / "ne_50m_admin_0_countries.shp"
COUNTRIES_URL = (
    "https://naciscdn.org/naturalearth/50m/cultural/"
    "ne_50m_admin_0_countries.zip"
)

# --------------------------------------------------------------------------- #
# Shape catalogue                                                              #
# --------------------------------------------------------------------------- #

SHAPES_CATALOG = [
    # Countries
    {"id": "usa",       "name": "United States",    "category": "country"},
    {"id": "uk",        "name": "United Kingdom",   "category": "country"},
    {"id": "germany",   "name": "Germany",          "category": "country"},
    {"id": "france",    "name": "France",           "category": "country"},
    {"id": "japan",     "name": "Japan",            "category": "country"},
    {"id": "canada",    "name": "Canada",           "category": "country"},
    {"id": "australia", "name": "Australia",        "category": "country"},
    {"id": "brazil",    "name": "Brazil",           "category": "country"},
    {"id": "india",     "name": "India",            "category": "country"},
    {"id": "china",     "name": "China",            "category": "country"},
    {"id": "mexico",    "name": "Mexico",           "category": "country"},
    {"id": "spain",     "name": "Spain",            "category": "country"},
    {"id": "italy",     "name": "Italy",            "category": "country"},
    {"id": "sweden",    "name": "Sweden",           "category": "country"},
    {"id": "norway",    "name": "Norway",           "category": "country"},
    # Continents
    {"id": "africa",        "name": "Africa",         "category": "continent"},
    {"id": "asia",          "name": "Asia",            "category": "continent"},
    {"id": "europe",        "name": "Europe",          "category": "continent"},
    {"id": "north_america", "name": "North America",   "category": "continent"},
    {"id": "south_america", "name": "South America",   "category": "continent"},
    {"id": "oceania",       "name": "Oceania",         "category": "continent"},
    {"id": "antarctica",    "name": "Antarctica",      "category": "continent"},
]

# Map shape IDs → continent filter values
CONTINENT_MAP: dict[str, list[str]] = {
    "africa":        ["Africa"],
    "asia":          ["Asia"],
    "europe":        ["Europe"],
    "north_america": ["North America"],
    "south_america": ["South America"],
    "oceania":       ["Oceania"],
    "antarctica":    ["Antarctica"],
}

# Map country IDs → Natural Earth NAME field
COUNTRY_MAP: dict[str, str] = {
    "usa":       "United States of America",
    "uk":        "United Kingdom",
    "germany":   "Germany",
    "france":    "France",
    "japan":     "Japan",
    "canada":    "Canada",
    "australia": "Australia",
    "brazil":    "Brazil",
    "india":     "India",
    "china":     "China",
    "mexico":    "Mexico",
    "spain":     "Spain",
    "italy":     "Italy",
    "sweden":    "Sweden",
    "norway":    "Norway",
}

# --------------------------------------------------------------------------- #
# Data management                                                              #
# --------------------------------------------------------------------------- #

_world_cache: Optional[gpd.GeoDataFrame] = None


def ensure_data() -> None:
    """Download + extract Natural Earth shapefile if not already present."""
    if COUNTRIES_SHP.exists():
        return

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = DATA_DIR / "ne_50m_admin_0_countries.zip"

    print("Downloading Natural Earth 50m country data…")
    resp = requests.get(COUNTRIES_URL, timeout=120, stream=True)
    resp.raise_for_status()

    with open(zip_path, "wb") as fh:
        for chunk in resp.iter_content(chunk_size=65536):
            fh.write(chunk)

    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(DATA_DIR)

    zip_path.unlink(missing_ok=True)
    print("Natural Earth data ready.")


def _world() -> gpd.GeoDataFrame:
    global _world_cache
    if _world_cache is None:
        ensure_data()
        _world_cache = gpd.read_file(COUNTRIES_SHP)
    return _world_cache


def _russia_east_poly(poly) -> bool:
    """Return True if this Russia polygon belongs to the eastern half."""
    lon = poly.centroid.x
    # Polygons past the antimeridian are stored with negative longitudes (~-170)
    # in EPSG:4326 — they are far eastern Russia, not western.
    if lon < -30:
        return True
    return lon >= RUSSIA_SPLIT_LON


def _get_gdf(shape_id: str) -> Optional[gpd.GeoDataFrame]:
    """Return a GeoDataFrame for the given shape_id, or None if not found."""
    world = _world()

    if shape_id in CONTINENT_MAP:
        continents = CONTINENT_MAP[shape_id]
        gdf = world[world["CONTINENT"].isin(continents)]
        return gdf if len(gdf) > 0 else None

    # Russia split — return only the west or east polygons
    if shape_id in ('russia_west', 'russia_east'):
        russia_rows = world[world["NAME"] == "Russia"]
        if len(russia_rows) == 0:
            return None
        russia_rows = russia_rows.to_crs("EPSG:4326")
        all_polys: list = []
        for geom in russia_rows.geometry:
            if geom is not None:
                all_polys.extend(_extract_polygons(geom))
        if shape_id == 'russia_west':
            filtered = sorted([p for p in all_polys if not _russia_east_poly(p)],
                              key=lambda p: p.area, reverse=True)
        else:
            filtered = sorted([p for p in all_polys if _russia_east_poly(p)],
                              key=lambda p: p.area, reverse=True)
        if not filtered:
            return None
        return gpd.GeoDataFrame(
            [{'NAME': 'Russia', 'geometry': p} for p in filtered],
            crs="EPSG:4326",
        )

    # Try legacy fixed IDs (usa, uk, germany …) first for backwards compat
    if shape_id in COUNTRY_MAP:
        name = COUNTRY_MAP[shape_id]
        gdf = world[world["NAME"] == name]
        return gdf if len(gdf) > 0 else None

    # Dynamic lookup: find the country whose name slugifies to shape_id
    for nat_name in world["NAME"].dropna().unique():
        if _name_to_slug(nat_name) == shape_id:
            gdf = world[world["NAME"] == nat_name]
            return gdf if len(gdf) > 0 else None

    return None


# --------------------------------------------------------------------------- #
# Rasterisation                                                                #
# --------------------------------------------------------------------------- #

def shape_to_mask(shape_id: str, base_width: int = 2000) -> Optional[np.ndarray]:
    """
    Rasterize a named geographic shape to a binary numpy mask.

    Returns an ndarray of shape (height, width) with dtype uint8,
    where 255 = inside the shape and 0 = outside.
    Aspect-ratio padding is applied later by the caller.
    Returns None if shape_id is not recognised.
    """
    gdf = _get_gdf(shape_id)
    if gdf is None:
        return None

    gdf = gdf.to_crs("EPSG:4326")

    # Per-shape bounding box overrides — tightens the canvas for shapes whose
    # full extent (e.g. overseas territories) would swamp the main landmass.
    BOUNDS_OVERRIDE: dict[str, tuple] = {
        "usa":         (-125.0, 24.0,  -66.0, 50.0),  # CONUS only
        "canada":      (-141.0, 41.5,  -52.0, 70.0),  # mainland Canada
        "russia_west": (  18.0, 41.0,   67.0, 75.0),  # Kaliningrad → Urals
        "russia_east": (  57.0, 40.0,  180.0, 78.0),  # Urals → Far East
    }
    if shape_id in BOUNDS_OVERRIDE:
        minx, miny, maxx, maxy = BOUNDS_OVERRIDE[shape_id]
    else:
        minx, miny, maxx, maxy = gdf.total_bounds

    span_x = maxx - minx
    span_y = maxy - miny
    if span_x <= 0 or span_y <= 0:
        return None

    # Equirectangular correction: scale width by cos(mid-latitude) so that
    # shapes at high latitudes (North America, Nordics, etc.) aren't squashed.
    import math
    cos_lat = math.cos(math.radians((miny + maxy) / 2.0))
    aspect = span_y / max(span_x * cos_lat, 1e-9)
    base_height = max(1, int(base_width * aspect))

    img = Image.new("L", (base_width, base_height), 0)
    draw = ImageDraw.Draw(img)

    def geo_to_px(lon: float, lat: float) -> tuple[float, float]:
        px = (lon - minx) / span_x * base_width
        py = (1.0 - (lat - miny) / span_y) * base_height  # flip Y axis
        return px, py

    for geom in gdf.geometry:
        if geom is not None:
            _draw_geom(draw, geom, geo_to_px)

    return np.array(img)


def _draw_geom(draw: ImageDraw.ImageDraw, geom, to_px) -> None:
    gtype = geom.geom_type
    if gtype == "Polygon":
        _draw_polygon(draw, geom, to_px)
    elif gtype == "MultiPolygon":
        for poly in geom.geoms:
            _draw_polygon(draw, poly, to_px)
    elif gtype == "GeometryCollection":
        for g in geom.geoms:
            _draw_geom(draw, g, to_px)


def _draw_polygon(draw: ImageDraw.ImageDraw, polygon, to_px) -> None:
    exterior = [to_px(x, y) for x, y in polygon.exterior.coords]
    if len(exterior) >= 3:
        draw.polygon(exterior, fill=255)
    for interior in polygon.interiors:
        hole = [to_px(x, y) for x, y in interior.coords]
        if len(hole) >= 3:
            draw.polygon(hole, fill=0)


def parts_to_mask(part_ids: list[str], base_width: int = 2000) -> Optional[np.ndarray]:
    """
    Rasterize a selection of individual polygon parts into one binary mask.

    Each part_id has format "{shape_id}|{poly_index}" where poly_index is the
    0-based index into the area-sorted polygon list for that country.
    Returns None if no valid parts are found.
    """
    import math

    polygons = []
    for pid in part_ids:
        if '|' not in pid:
            continue
        shape_id, idx_str = pid.rsplit('|', 1)
        try:
            poly_idx = int(idx_str)
        except ValueError:
            continue

        gdf = _get_gdf(shape_id)
        if gdf is None:
            continue
        gdf = gdf.to_crs("EPSG:4326")

        all_polys: list = []
        for geom in gdf.geometry:
            if geom is not None:
                all_polys.extend(_extract_polygons(geom))

        if poly_idx < len(all_polys):
            polygons.append(all_polys[poly_idx])

    if not polygons:
        return None

    all_bounds = [p.bounds for p in polygons]
    minx = min(b[0] for b in all_bounds)
    miny = min(b[1] for b in all_bounds)
    maxx = max(b[2] for b in all_bounds)
    maxy = max(b[3] for b in all_bounds)

    span_x = maxx - minx
    span_y = maxy - miny
    if span_x <= 0 or span_y <= 0:
        return None

    cos_lat = math.cos(math.radians((miny + maxy) / 2.0))
    aspect = span_y / max(span_x * cos_lat, 1e-9)
    base_height = max(1, int(base_width * aspect))

    img = Image.new("L", (base_width, base_height), 0)
    draw = ImageDraw.Draw(img)

    def geo_to_px(lon: float, lat: float) -> tuple[float, float]:
        px = (lon - minx) / span_x * base_width
        py = (1.0 - (lat - miny) / span_y) * base_height
        return px, py

    for poly in polygons:
        _draw_polygon(draw, poly, geo_to_px)

    return np.array(img)


def get_shapes_catalog() -> list:
    """Return continents + every Natural Earth country as selectable shapes."""
    continents = [s for s in SHAPES_CATALOG if s["category"] == "continent"]

    world = _world()
    _reverse = {v: k for k, v in COUNTRY_MAP.items()}
    countries = []
    for nat_name in sorted(world["NAME"].dropna().unique()):
        if nat_name == "Russia":
            # Replace the single Russia entry with two split regions
            countries.append({"id": "russia_west", "name": "Russia (West)", "category": "country"})
            countries.append({"id": "russia_east", "name": "Russia (East)", "category": "country"})
            continue
        shape_id = _reverse.get(nat_name, _name_to_slug(nat_name))
        countries.append({"id": shape_id, "name": nat_name, "category": "country"})

    return countries + continents


def get_world_geojson() -> str:
    """Return world countries as GeoJSON with one feature per polygon.

    Every feature has:
      shape_id   — country-level ID (whole-country selection)
      part_id    — "{shape_id}|{i}" sorted by area desc (part-level selection)
      part_count — number of polygons in the country
    Legacy short IDs (usa, uk …) are preserved for known entries.
    """
    world = _world()
    gdf = world[['NAME', 'CONTINENT', 'geometry']].copy().to_crs("EPSG:4326")

    _reverse = {v: k for k, v in COUNTRY_MAP.items()}

    rows = []
    for _, row in gdf.iterrows():
        name = row['NAME']
        if not name:
            continue
        geom = row['geometry']
        if geom is None:
            continue

        polys = _extract_polygons(geom)

        if name == "Russia":
            # Split polygons into russia_west / russia_east by centroid longitude
            west = sorted([p for p in polys if not _russia_east_poly(p)],
                          key=lambda p: p.area, reverse=True)
            east = sorted([p for p in polys if _russia_east_poly(p)],
                          key=lambda p: p.area, reverse=True)
            for r_id, r_polys in (("russia_west", west), ("russia_east", east)):
                for i, poly in enumerate(r_polys):
                    simplified = poly.simplify(0.01, preserve_topology=True)
                    rows.append({
                        'NAME': name,
                        'CONTINENT': row['CONTINENT'],
                        'shape_id': r_id,
                        'part_id': f"{r_id}|{i}",
                        'part_count': len(r_polys),
                        'geometry': simplified,
                    })
            continue

        shape_id = _reverse.get(name, _name_to_slug(name))
        part_count = len(polys)

        for i, poly in enumerate(polys):
            simplified = poly.simplify(0.01, preserve_topology=True)
            rows.append({
                'NAME': name,
                'CONTINENT': row['CONTINENT'],
                'shape_id': shape_id,
                'part_id': f"{shape_id}|{i}",
                'part_count': part_count,
                'geometry': simplified,
            })

    exploded = gpd.GeoDataFrame(rows, crs="EPSG:4326")
    return exploded.to_json()
