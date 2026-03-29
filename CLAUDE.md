# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

Achilles is an organizational stress-testing platform. Users upload documents about their organization, AI builds a dependency graph, deterministic math computes weakpoints/cascades/adversarial simulations, and AI explains outputs with narratives. The core principle: **AI generates. Math computes. AI explains.** — AI never touches the numbers. See `docs/BUSINESS_PLAN.md` for the full pitch kit.

## Docs as Source of Truth

Read the relevant files in `docs/` before making changes. The `docs/` directory is the product source of truth; `.claude/` mirrors those docs for Claude tooling context and should stay synchronized if the docs change. When docs and code diverge, update code to match docs unless the user explicitly changes the spec.

## Build & Dev Commands

### First-time setup

```bash
./bin/setup          # installs pnpm deps + creates .venv + pip installs backend
```

### Run both frontend and backend together

```bash
./bin/dev            # starts API (port 8000) and web (Next.js) concurrently
```

### Individual app dev servers

```bash
pnpm --filter @achilles/api dev   # FastAPI dev server (apps/api)
pnpm --filter @achilles/web dev   # Next.js dev server (apps/web)
```

### Build, lint, typecheck (via Turbo across workspaces)

```bash
pnpm build           # turbo run build
pnpm lint            # turbo run lint
pnpm typecheck       # turbo run typecheck
pnpm format          # prettier --write .
pnpm format:check    # prettier --check .
```

### Backend-specific (run from activated .venv)

```bash
source .venv/bin/activate
python -m pytest                        # run all tests
python -m pytest tests/test_foo.py      # run a single test file
python -m pytest tests/test_foo.py::test_bar  # run a single test
python -m ruff check src tests          # lint
python -m mypy src tests               # typecheck
```

## Architecture

Monorepo managed by **pnpm workspaces** + **Turbo**. Two apps:

- **`apps/api`** — Python 3.14 + FastAPI backend. Source in `apps/api/src/achilles_api/`. Package name: `achilles-api`. Uses setuptools with editable install. Entry point: `main.py`.
- **`apps/web`** — Next.js 16 + React 19 frontend. Uses App Router (`apps/web/app/`). State via Zustand. Visualization via D3 and Recharts. Styled with Tailwind CSS v4.

### Module pipeline (maps to `docs/` files)

1. **Data Ingestion** (01) — user files parsed, AI builds the graph
2. **Weakpoint Analysis** (02) — pure math: rankings, bridges, clusters
3. **Agent Briefing** (03) — analysis converted to targeted attack briefs
4. **State Tree Exploration** (04) — multi-agent adversarial search of failure scenarios

Each module has a companion sub-module (01A Graph Model, 02A Cascade Engine, 03A Agent Strategies, 04A Results Ranking). API shapes defined in `docs/05_API.md`, frontend routes in `docs/06_FRONTEND.md`.

## Repo Conventions

- Backend work goes in `apps/api`, frontend in `apps/web`.
- Analysis modules must stay pure and deterministic — no AI in the math.
- API shapes follow `docs/05_API.md`; frontend routes follow `docs/06_FRONTEND.md` (adapted to App Router).
- No feature code outside `apps/api` and `apps/web`. Shared config/infra stays at repo root.
- Environment-specific values go in `.env` files, not hardcoded. Copy `.env.example` to `.env`.
- Before opening a PR, always ask the user for the task number from the board.
- Each PR should be labeled `HALK-X`, where `X` is the task number from the board.

## Tooling & Style

- **Python**: 3.14 (excludes 3.14.1). Ruff for linting (line-length 100, rules: E/F/I/B/UP/N). MyPy in strict mode. Pytest with asyncio_mode=auto. 4-space indent.
- **TypeScript/JS**: Node 22. ESLint + Prettier (double quotes, semicolons, trailing commas). 2-space indent.
- **Formatting**: EditorConfig enforces charset utf-8, LF line endings, final newline.

## Expected Build Order

1. Graph model and cascade engine
2. Weakpoint analysis
3. Agent briefing and strategies
4. State tree exploration and ranking
5. FastAPI integration
6. Next.js frontend
