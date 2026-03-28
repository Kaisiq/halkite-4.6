# Halkite 4.6

Infrastructure scaffold for NEXUS, prepared for both Codex and Claude-driven development.

## Repo Layout

```text
apps/
  api/    Python + FastAPI backend
  web/    Next.js frontend
docs/     Authoritative product and architecture docs
.claude/  Claude context mirror of the docs
```

## Tooling Baseline

- Node.js 22 via `.nvmrc`
- `pnpm` workspace for frontend and shared JS tooling
- Python 3.14 via `.python-version`
- FastAPI backend metadata in `apps/api/pyproject.toml`
- Turbo for cross-workspace task orchestration
- ESLint, TypeScript, Tailwind, Prettier, Ruff, MyPy, Pytest

## First Run

Frontend:

```bash
nvm use
pnpm install
```

Backend:

```bash
python3.14 -m venv .venv
source .venv/bin/activate
python -m ensurepip --upgrade
python -m pip install --upgrade pip
python -m pip install -e ./apps/api[dev]
```

## Environment

Copy `.env.example` to `.env` and fill in secrets as needed. App-specific templates also exist in:

- `apps/web/.env.local.example`
- `apps/api/.env.example`

## Docker Deployment

For an on-prem delivery, the repo now includes:

- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `docker-compose.yml`
- `docs/07_DEPLOYMENT.md`

Standard flow:

```bash
cp .env.example .env
docker compose up --build -d
```

The frontend is served on port `3000` by default and proxies backend requests
to the API container internally, so clients can use a single public entrypoint.
