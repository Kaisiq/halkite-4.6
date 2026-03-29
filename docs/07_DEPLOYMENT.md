# Module 7 — Deployment

## Purpose

Containerized on-prem deployment for Halkantir. The goal is to hand clients a
repeatable Docker-based package that runs the FastAPI backend and Next.js
frontend with minimal environment-specific changes.

---

## Delivery Model

- `apps/api/Dockerfile` builds the FastAPI backend image.
- `apps/web/Dockerfile` builds the Next.js frontend image.
- `docker-compose.yml` starts the full stack for a client environment.

The frontend proxies `/api/*` and `/ws/*` to the backend internally, so client
browsers only need to reach the web service.

---

## Runtime Topology

```text
Client Browser
      |
      v
Halkantir Web Container (Next.js, port 3000)
      |
      v
Halkantir API Container (FastAPI, port 8000)
      |
      v
MongoDB Container (port 27017, persistent volume)
```

---

## Environment

### API

- `GEMINI_API_KEY`: required when AI-backed ingestion or narrative generation is enabled.
- `GEMINI_MODEL_FALLBACKS`: optional comma-separated ordered fallback list used when the primary Gemini model returns `429 RESOURCE_EXHAUSTED`. Default fallback chain is `gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash`.
- `MONGODB_URI`: MongoDB connection string. Default `mongodb://mongo:27017/halkantir` in Docker. When unset, the API falls back to in-memory session storage (sessions lost on restart).
- `API_HOST`: bind host inside the container. Default `0.0.0.0`.
- `API_PORT`: bind port inside the container. Default `8000`.
- `LOG_LEVEL`: Uvicorn log level. Default `info`. Uppercase values are normalized in the container.
- `HALKANTIR_DATA_DIR`: directory for standard format JSON persistence. Default `data`, mapped to a Docker volume.

The API now fails during startup if any required environment variable is missing.

### Web

- `API_INTERNAL_BASE_URL`: internal backend URL used by Next.js rewrites. Default `http://api:8000`.
- `NEXT_PUBLIC_API_BASE_URL`: optional explicit browser-side API base URL. Leave empty for same-origin deployment.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: optional unless Google Drive folder import is enabled in the browser.

The web app loads optional public environment variables from repo and app env files. Features that depend on them stay unavailable until configured.

If Google Drive import is enabled, the OAuth client must be configured as a
Google "Web application" client and every exact browser origin must be listed
under Authorized JavaScript origins. For local development this commonly means
`http://localhost:3000` and, if used, `http://127.0.0.1:3000`. The browser
token flow used by the app does not require a custom redirect URI in the app
code.

### Published Ports

- `WEB_EXTERNAL_PORT`: host port mapped to the web container. Default `3000`.
- `API_EXTERNAL_PORT`: host port mapped to the API container. Default `8000`.

---

## Standard On-Prem Flow

1. Copy `.env.example` to `.env`.
2. Set `GEMINI_API_KEY` if AI-assisted ingestion/narrative features are required.
3. Build and start the stack with `docker compose up --build -d`.
4. Open `http://<host>:${WEB_EXTERNAL_PORT:-3000}`.
5. Verify API health at `http://<host>:${API_EXTERNAL_PORT:-8000}/api/health` if direct API access is exposed.

---

## Notes

- Session storage uses MongoDB when `MONGODB_URI` is set (default in Docker),
  with automatic fallback to in-memory storage for local dev. Graph data is
  persisted to MongoDB after each mutation (upload, update, explore) and
  restored on session retrieval.
- MongoDB data is stored in a named Docker volume (`mongo_data`) and survives
  container restarts.
- For client environments with stricter ingress rules, only the web port needs
  to be exposed if same-origin proxying is used.
- The `GET /api/sessions` endpoint lists all known session IDs.
