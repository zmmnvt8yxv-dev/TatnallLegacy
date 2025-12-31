# Tatnall Legacy

A single-page React app for exploring Tatnall League history, current operations, and Sleeper-facing tools.

## Project structure

```
.
├── data/                 # Generated season JSON + manifest
├── public/               # Static assets served by Vite (including /data)
├── scripts/              # Data ingestion/normalization scripts
├── src/
│   ├── components/       # Shared UI + data widgets (player search, cards, modals)
│   ├── data/             # Schema + data selectors used by the UI
│   ├── hooks/            # React hooks (season selection, data loading)
│   ├── lib/              # Front-end utilities (cn, user log)
│   ├── pages/            # Route-level pages (Summary, Rankings, Recaps)
│   ├── sections/         # Data-rich league sections (Teams, Matchups, Draft, etc.)
│   └── styles/           # Tailwind base styles + theme tokens
└── vite.config.ts        # Vite build + alias configuration
```

## Getting started

```sh
npm install
npm run dev
```

### Build

```sh
npm run build
```

### Update data

The `scripts/` directory contains the Python data pipeline that normalizes ESPN/Sleeper exports into
`public/data/*.json` files used by the UI. After updating raw data, rebuild:

```sh
npm run build:data
```

## Notes

- The app uses a single React codebase (no duplicate front-end directories).
- Season data is lazy-loaded on demand to keep initial load times fast.
