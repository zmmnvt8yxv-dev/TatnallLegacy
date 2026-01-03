# Tatnall Legacy League Encyclopedia

## Runbook

### Build site data
1. Ensure the yearly league JSON exports exist under `data/` (e.g., `data/2025.json`).
2. Ensure the weekly fantasy exports exist under `data_raw/master/` (parquet or CSV). The build uses:
   - `player_week_fantasy_2015_2025_with_war.*` (preferred)
   - `player_week_fantasy_2015_2025_with_z.*`
   - `player_week_fantasy_2015_2025_with_td_bonus.*`
   - `player_week_fantasy_2015_2025.*`
3. Generate web-ready JSON chunks and manifest (weeks 1–18 only):
   ```bash
   npm run build:data
   ```
   This writes app-ready JSON to `public/data/` and updates `public/data/manifest.json`.
   Rerun this after updating any `data_raw/` exports so the frontend has the latest datasets.

### Install dependencies
```bash
npm install
```

### Run the site locally
```bash
npm run dev
```

### Build the production bundle
```bash
npm run build
```

### GitHub Pages
The app is configured for the `/TatnallLegacy/` subpath (see `vite.config.ts`). All data fetches use
`import.meta.env.BASE_URL`, so deployments under GitHub Pages should work without path changes.
