# Claude Project Memory

Read the relevant files in `docs/` before making changes. The `docs/` directory is the product source of truth; `.claude/` mirrors those docs for Claude tooling context and should stay synchronized if the docs change.

## Project Summary

NEXUS is a deterministic network survival analyzer:

- AI builds graphs from uploaded organization data.
- Math computes graph health, weakpoints, cascades, and state-tree exploration.
- AI explains outputs and generates narratives after computation.

## Implementation Direction

- Backend: Python + FastAPI.
- Frontend: Next.js + React + D3 + Tailwind CSS.
- Analysis modules should stay pure and deterministic.
- API shapes should follow `docs/05_API.md`.
- Frontend routes and visualization expectations should follow `docs/06_FRONTEND.md`, adapted to Next.js App Router.

## Repo Conventions

- Put backend work in `apps/api`.
- Put frontend work in `apps/web`.
- Keep configuration and infrastructure changes at the repo root when shared.
- Avoid mixing speculative product decisions into implementation without updating docs.

