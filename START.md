# Geo Dot Asset Tool — Quick Start

## Option A: Docker (recommended for team use)

```bash
cd geo-dot-tool
docker compose up --build
```

Open **http://localhost:8000**

> The first run downloads ~25 MB of Natural Earth shapefiles. Subsequent starts are instant.

---

## Option B: Run locally without Docker

### Backend
```bash
cd geo-dot-tool/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend (in a second terminal)
```bash
cd geo-dot-tool/frontend
npm install
npm run dev
```

Open **http://localhost:3000**

---

## Usage

1. **Shape** — choose a continent / region / country from the dropdown,  
   or upload a PNG/JPG silhouette as a custom shape mask
2. **Pattern** — adjust dot spacing, size, jitter, and edge-fade
3. **Colors** — pick a preset scheme (Hero uses `#00A4EF` + `#737373`)  
   or build a custom palette with up to 5 colours and custom mix ratios
4. **Export** — select resolutions (2K → 8K) and formats (PNG / Alpha PNG / SVG),  
   then click **Generate & Download ZIP**

## Colour Presets (brand palette)

| Preset | Dots | Background |
|--------|------|------------|
| Hero   | Cyan `#00A4EF` 60% + Gray `#737373` 40% | `#EAEAEA` |
| Hero Transparent | same | transparent |
| Dark | Cyan + White | `#000000` |
| Mono Cyan | `#00A4EF` only | transparent |

## Custom Mask Tips

- Use a **black silhouette on white background** (PNG works best)
- Enable **Invert mask** if your file has a white shape on a dark background
- Any shape works: logos, custom maps, text outlines, etc.
