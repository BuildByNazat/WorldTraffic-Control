# WorldTraffic Control

WorldTraffic Control is an operator-oriented traffic monitoring app with live map tracking, history review, replay, alerts, incidents, analytics, and export tools.

## Stack

- Backend: FastAPI, SQLAlchemy, SQLite, httpx
- Frontend: React, Vite, TypeScript, Leaflet

## Quick local evaluation

The default path now uses OpenSky as the first real-data evaluation provider. If OpenSky is unavailable, the app falls back internally to the simulated feed so the product remains usable.

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

Evaluation-first defaults:
- aircraft use OpenSky evaluation mode by default, anonymously if credentials are not set yet
- the simulated feed remains available as an internal fallback or an explicit developer override
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

- `AVIATION_DATA_MODE`
  - Optional
  - Default: `evaluation`
  - Valid: `demo`, `evaluation`, `commercial`
  - `provider` is still accepted as a legacy alias and is normalized automatically
- `AVIATION_PROVIDER`
  - Optional
  - Default: `opensky`
  - Valid: `simulated`, `opensky`, `commercial_stub`
- `AIRCRAFT_PROVIDER`
  - Optional legacy alias for `AVIATION_PROVIDER`
- `APP_ENV`
  - Optional
  - Default: `development`
  - Valid: `development`, `production`
- `OPENSKY_USERNAME`
  - Optional
  - Used when `AVIATION_PROVIDER=opensky`
- `OPENSKY_PASSWORD`
  - Optional
  - Used when `AVIATION_PROVIDER=opensky`
- `COMMERCIAL_PROVIDER_NAME`
  - Optional
  - Placeholder label for future vendor evaluation handoff
- `COMMERCIAL_API_BASE_URL`
  - Optional
  - Reserved for a future commercial adapter
- `COMMERCIAL_API_KEY`
  - Optional
  - Reserved for a future commercial adapter
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
- `PUBLIC_BASE_URL`
  - Optional
  - Public app URL for deployment-facing status/docs context
- `CORS_ORIGINS`
  - Optional
  - Comma-separated list of allowed frontend origins
  - For public deployment, replace localhost defaults with the real frontend origin

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

Notes:
- the frontend container serves the built app with nginx
- `/api/*` and `/ws/*` are proxied to the backend container
- SQLite data is persisted in the named Docker volume `worldtraffic_data`
- the default Docker path is also demo-friendly and works without Gemini or OpenSky credentials
- the backend is intentionally kept internal to the compose network; public access flows through the frontend reverse proxy

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
- use `APP_ENV=production`
- expose health endpoints at `/healthz` and `/readyz`
- keep the same-origin frontend/API model where practical

## Aviation provider modes

- `demo`
  - Use `AVIATION_PROVIDER=simulated`
  - Best for explicit developer demos and offline fallback testing
- `evaluation`
  - Use `AVIATION_PROVIDER=opensky`
  - Intended for the current real-data product path and credential handoff
  - Works anonymously or with real OpenSky credentials
  - Filters obviously stale tracks while keeping simulated fallback available if OpenSky fails
- `commercial`
  - Use `AVIATION_PROVIDER=commercial_stub`
  - Keeps the integration boundary ready for a licensed provider without pretending one is finalized

## Recommended evaluation setup

For the current aviation-first product path:
- keep `AVIATION_PROVIDER=opensky`
- use `AVIATION_DATA_MODE=evaluation`
- add OpenSky credentials when available, but anonymous mode is acceptable for first evaluation passes
- use `AVIATION_PROVIDER=simulated` only when you intentionally want a developer/demo override
- leave `GEMINI_API_KEY` unset unless you have a stable camera image source ready
- start in Live mode to show the map, overlays, alerts rail, and polished shell
- switch to History mode to show replay, analytics, filters, incidents, and export

## Production deployment notes

For a first real public deployment:
- prefer the same-origin model already used by the nginx container so the browser only talks to one public host
- set `APP_ENV=production`
- set `PUBLIC_BASE_URL` to the public HTTPS URL
- replace default localhost `CORS_ORIGINS` with the real public frontend origin if you are serving frontend and backend separately
- persist `DB_PATH` on durable storage; SQLite is acceptable for a single-node first deployment but not for multi-instance write-heavy scaling
- keep `AVIATION_PROVIDER=opensky` as the normal aviation path
- rely on the simulated provider only as an internal safety net or explicit development override
- leave `GEMINI_API_KEY` unset if camera analysis is not part of the launch plan; the UI will present this clearly instead of failing

## What still needs replacement before a true commercial launch

This pass improves runtime safety and deployability, but a real commercial launch still needs:
- real authentication and operator access control
- final legal/privacy pages instead of the included placeholders
- HTTPS, domain, and reverse-proxy hardening in the target environment
- centralized logging, uptime monitoring, and backup strategy
- a stronger database than SQLite if you move beyond a single-instance deployment
- secrets management outside checked-in env files

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
