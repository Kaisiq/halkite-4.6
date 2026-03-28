# Module 7 — Deployment

## Purpose

Containerized on-prem deployment for NEXUS. The goal is to hand clients a
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
NEXUS Web Container (Next.js, port 3000)
      |
      v
NEXUS API Container (FastAPI, port 8000)
```

---

## Environment

### API

- `GEMINI_API_KEY`: required when AI-backed ingestion or narrative generation is enabled.
- `API_HOST`: bind host inside the container. Default `0.0.0.0`.
- `API_PORT`: bind port inside the container. Default `8000`.
- `LOG_LEVEL`: Uvicorn log level. Default `info`. Uppercase values are normalized in the container.

The API now fails during startup if any required environment variable is missing.

### Web

- `API_INTERNAL_BASE_URL`: internal backend URL used by Next.js rewrites. Default `http://api:8000`.
- `NEXT_PUBLIC_API_BASE_URL`: optional explicit browser-side API base URL. Leave empty for same-origin deployment.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: required when Google Drive folder import is enabled in the browser.

The web app now fails during startup if any required public environment variable is missing.

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

- Session storage is currently in-memory, matching `docs/05_API.md`.
- For client environments with stricter ingress rules, only the web port needs
  to be exposed if same-origin proxying is used.
- For production persistence and horizontal scaling, replace the in-memory
  session store with Redis or a database-backed implementation.
