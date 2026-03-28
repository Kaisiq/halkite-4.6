# Achilles

**Prevent the predictable. Then move faster.**

Achilles is an organizational stress-testing platform. Upload whatever you have about your organization — org charts, spreadsheets, system diagrams, supplier lists — and Achilles maps your dependencies, finds your blind spots, and simulates worst-case failure scenarios before they happen.

**AI generates. Math computes. AI explains.** — AI never touches the numbers.

## How It Works

1. **Upload** — drag-and-drop documents (PDF, DOCX, XLSX, CSV, images, JSON)
2. **Graph** — AI reads your data and builds a dependency network across people, technology, supply chain, operations, and more
3. **Analyze** — deterministic graph algorithms identify bridge nodes, fragile clusters, compound failure points, and layer vulnerabilities
4. **Simulate** — five adversarial agents run thousands of attack simulations against your network
5. **Report** — ranked worst-case scenarios with narratives, cascade breakdowns, and actionable recommendations

## Quick Start

```bash
./bin/setup          # install all dependencies
./bin/dev            # start API (port 8000) + frontend (port 3000)
```

Then open http://localhost:3000 and upload a file. A demo dataset is available at `demo/mclimate.json`.

## Repo Layout

```text
apps/
  api/    Python 3.14 + FastAPI backend (graph engine, analysis, simulation)
  web/    Next.js 16 + React 19 frontend (D3 visualization, dashboards)
docs/     Product specs, architecture, business plan
demo/     Sample datasets for showcase
```

## Architecture

Monorepo managed by **pnpm workspaces** + **Turbo**:

| App | Stack | Purpose |
|-----|-------|---------|
| `apps/api` | Python 3.14, FastAPI, NetworkX, NumPy | Ingestion, graph engine, cascade simulation, adversarial agents, ranking |
| `apps/web` | Next.js 16, React 19, D3.js, Zustand, Tailwind | Upload, network graph visualization, simulation controls, report |

### Module Pipeline

```
Upload → [1] Data Ingestion (AI) → [2] Weakpoint Analysis (Math) → [3] Agent Briefing → [4] State Tree Exploration (Math) → Report (AI narrative)
```

See `docs/00_ARCHITECTURE.md` for full details and `docs/BUSINESS_PLAN.md` for the pitch kit.

## Commands

```bash
./bin/dev                              # run both apps
pnpm --filter @halkite/api dev         # API only
pnpm --filter @halkite/web dev         # frontend only
pnpm build                             # build all
pnpm lint                              # lint all
pnpm typecheck                         # typecheck all
pnpm format                            # format all
```

## Environment

Copy `.env.example` to `.env` and add your `ANTHROPIC_API_KEY`. App-specific templates:

- `apps/web/.env.local.example`
- `apps/api/.env.example`

## Docker Deployment

For on-prem delivery:

- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `docker-compose.yml`
- `docs/07_DEPLOYMENT.md`

```bash
cp .env.example .env
docker compose up --build -d
```

The frontend is served on port `3000` and proxies backend requests to the API container internally.
