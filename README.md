# Tatnall Legacy League Encyclopedia

## Runbook

### Build site data
1. Ensure the yearly league JSON exports exist under `data/` (e.g., `data/2025.json`).
2. Generate web-ready JSON chunks and manifest:
   ```bash
   python scripts/build_site_weekly_chunks.py
   python scripts/build_site_data_manifest.py
   ```
   Or run:
   ```bash
   npm run build:data
   ```

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
