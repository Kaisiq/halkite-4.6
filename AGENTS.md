# Codex Project Guide

## Source Of Truth

- Product and architecture docs live in `docs/`.
- The mirrored files in `.claude/` exist for Claude tooling context. Treat `docs/` as authoritative.
- Before changing any module, read its corresponding doc in `docs/`.

## Product Constraints

- NEXUS is a deterministic analysis system.
- AI may build the initial graph from user data and generate human-readable narrative.
- AI must not invent or modify mathematical outputs once the graph is built.
- Backend is Python + FastAPI.
- Frontend is Next.js + React + D3 + Tailwind.

## Expected Build Order

1. Graph model and cascade engine.
2. Weakpoint analysis.
3. Agent briefing and strategies.
4. State tree exploration and ranking.
5. FastAPI integration.
6. Next.js frontend.

## Working Rules

- Keep module boundaries aligned with the docs.
- Prefer small, composable packages and typed interfaces.
- When docs and code diverge, update code to match docs unless the user explicitly changes the spec.
- Do not add feature code outside `apps/api` and `apps/web`.
- Keep environment-specific values in env files, not hardcoded.
- Before opening a PR, always ask the user for the task number from the board.
- Each PR should be labeled `HALK-X`, where `X` is the task number from the board.

## Paths

- `apps/api`: Python backend.
- `apps/web`: Next.js frontend.
- `docs`: authoritative system design docs.
- `.claude`: Claude-specific context mirror and future Claude tooling assets.
