# WorldTraffic Control

WorldTraffic Control is an operator-oriented traffic monitoring app with live map tracking, history review, replay, alerts, incidents, analytics, and export tools.

## Stack

- Backend: FastAPI, SQLAlchemy, SQLite, httpx
- Frontend: React, Vite, TypeScript, Leaflet

## Quick local demo

The fastest demo path uses the default simulated aircraft provider and no external API keys.

1. Start the backend:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/activate
pip install -r backend/requirements.txt
Copy-Item .env.example backend/.env
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

2. Start the frontend in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

3. Open `http://localhost:5173`

Demo-safe defaults:
- aircraft use the built-in simulated provider unless `AIRCRAFT_PROVIDER=opensky`
- camera vision stays optional unless `GEMINI_API_KEY` is configured
- the dashboard remains usable even with no detections or no promoted incidents

## Local setup

### Backend

1. Create and activate a virtual environment in `backend/.venv`.
2. Install requirements:

```powershell
pip install -r backend/requirements.txt
```

3. Copy the backend env template:

```powershell
Copy-Item .env.example backend/.env
```

4. Start the backend:

```powershell
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:
- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`

### Frontend

1. Install frontend dependencies:

```powershell
cd frontend
npm install
```

2. Copy the frontend env template only if you need custom origins:

```powershell
Copy-Item .env.example .env.local
```

3. Start the frontend dev server:

```powershell
npm run dev
```

Frontend URL:
- App: `http://localhost:5173`

The Vite dev server proxies `/api` and `/ws` to the backend, so `localhost` frontend and backend work together without hardcoded client URLs.

## Environment variables

### Backend

Configured in `backend/.env` or project-root `.env`.

- `AIRCRAFT_PROVIDER`
  - Optional
  - Default: `simulated`
  - Valid: `simulated`, `opensky`
- `OPENSKY_USERNAME`
  - Optional
  - Used when `AIRCRAFT_PROVIDER=opensky`
- `OPENSKY_PASSWORD`
  - Optional
  - Used when `AIRCRAFT_PROVIDER=opensky`
- `BROADCAST_INTERVAL`
  - Optional
  - Default: `5.0`
- `CAMERA_FETCH_INTERVAL`
  - Optional
  - Default: `60.0`
- `GEMINI_API_KEY`
  - Optional
  - If missing, camera vision analysis is skipped cleanly
- `DB_PATH`
  - Optional
  - Default: `data/worldtraffic.db` relative to `backend/`
- `CORS_ORIGINS`
  - Optional
  - Comma-separated list of allowed frontend origins

### Frontend

Configured in `frontend/.env.local`.

- `VITE_API_URL`
  - Optional
  - Explicit backend API origin
- `VITE_WS_URL`
  - Optional
  - Explicit live WebSocket URL
- `VITE_DEV_PROXY_TARGET`
  - Optional
  - Default: `http://localhost:8000`
  - Used by Vite during local development

If `VITE_API_URL` and `VITE_WS_URL` are unset, the frontend defaults to same-origin `/api` and `/ws/live`, which is the preferred production deployment model behind a reverse proxy.

## Docker demo

For a containerized demo with the same-origin production-style frontend:

```powershell
docker compose up --build
```

URLs:
- App: `http://localhost:8080`
- Backend API: `http://localhost:8000`

Notes:
- the frontend container serves the built app with nginx
- `/api/*` and `/ws/*` are proxied to the backend container
- SQLite data is persisted in the named Docker volume `worldtraffic_data`
- the default Docker path is also demo-friendly and works without Gemini or OpenSky credentials

To stop the stack:

```powershell
docker compose down
```

## Production build

### Frontend build

```powershell
cd frontend
npm run build
```

This outputs static assets to `frontend/dist`.

To preview the production bundle locally:

```powershell
npm run preview
```

### Backend startup

Use a production ASGI server command without `--reload`, for example:

```powershell
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Recommended production pattern:
- serve the frontend static build from a web server or CDN
- reverse-proxy `/api` and `/ws/live` to the FastAPI backend
- set `CORS_ORIGINS` to the deployed frontend origin if frontend and backend are on different origins

## Recommended demo setup

For the most reliable public demo:
- keep `AIRCRAFT_PROVIDER=simulated` unless you specifically want live OpenSky data
- leave `GEMINI_API_KEY` unset unless you have a stable camera image source ready
- start in Live mode to show the map, overlays, alerts rail, and polished shell
- switch to History mode to show replay, analytics, filters, incidents, and export

This avoids rate-limit or external API surprises while still showing the full product flow.

## Recommended demo flow

1. Open Live mode and show the dashboard shell, map layers, and alert visibility.
2. Click a live alert or marker to show the detail drawer and map highlighting.
3. Switch to History mode and show filters, replay controls, and the analytics tab.
4. Open alerts/incidents/history search and export actions to demonstrate investigation workflows.
5. If incidents exist, open one and show note/status editing plus linked detail context.

## Repo hygiene

The repository now ignores:
- Python caches and virtual environments
- `frontend/node_modules` and frontend build output
- SQLite runtime files and WAL/journal files
- local `.env` files
- common OS/editor junk

## Verification

Backend:

```powershell
python -m compileall backend/app
```

Frontend:

```powershell
cd frontend
.\node_modules\.bin\tsc.cmd --noEmit
```
