# Achilles

**Organizational stress-testing platform.**

Upload documents about your organization. AI builds a dependency graph. Deterministic math finds weakpoints and simulates cascading failures. AI explains the results.

**AI generates. Math computes. AI explains.** — AI never touches the numbers.

## Pipeline

```
Upload → Data Ingestion (AI) → Weakpoint Analysis (Math) → Agent Briefing → State Tree Exploration (Math) → Report (AI narrative)
```

| Stage | What happens | AI involved? |
|-------|-------------|--------------|
| **Data Ingestion** | Parse files (PDF, DOCX, XLSX, CSV, images, JSON), AI extracts entities and dependencies into a weighted graph | Yes — graph construction |
| **Weakpoint Analysis** | 6 algorithms: node impact ranking, critical edge detection, bridge nodes, cluster detection, compound vulnerability pairs, layer dependency analysis | No — pure math |
| **Agent Briefing** | Convert analysis into targeted attack briefs for each adversarial agent | No — deterministic mapping |
| **State Tree Exploration** | Multi-agent depth-first search across failure scenarios with cascade propagation at each step | No — pure math |
| **Results & Narrative** | Rank top 10 worst-case scenarios, generate step-by-step cascade breakdowns and recommendations | Yes — narrative generation |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.14, FastAPI, Uvicorn |
| **Graph Engine** | NetworkX, NumPy, SciPy |
| **AI** | Google Gemini 2.5 Flash |
| **Frontend** | Next.js 16, React 19, TypeScript |
| **Visualization** | D3.js (force-directed graphs, tree layouts, cascade animation) |
| **State Management** | Zustand |
| **Styling** | Tailwind CSS v4 |
| **File Parsing** | PyPDF2, python-docx, openpyxl, Pillow |
| **Monorepo** | pnpm workspaces + Turborepo |
| **Deployment** | Docker, docker-compose, on-prem ready |

## Architecture

```
apps/
  api/    Python backend — ingestion, graph engine, cascade simulation, adversarial agents, ranking
  web/    Next.js frontend — upload, network visualization, simulation controls, report
docs/     Product specs, architecture docs (source of truth)
demo/     Sample datasets
```

### Backend Modules (~11,500 lines)

```
achilles_api/
├── ingestion/          # File parsing, AI extraction, deterministic scoring
│   ├── parser.py       # PDF, DOCX, XLSX, CSV, images, JSON, XML
│   ├── extractor.py    # Gemini-powered entity & edge extraction
│   ├── scoring.py      # Deterministic θ (importance), r (recovery cost), edge weights
│   └── google_drive.py # Google Drive folder import via OAuth
├── engine/             # Pure math — no AI
│   ├── weakpoint.py    # 6 analysis algorithms (impact, edges, bridges, clusters, pairs, layers)
│   ├── cascade.py      # Cascade propagation with damage spreading and health thresholds
│   ├── state_tree.py   # Depth-first adversarial search with memoization and pruning
│   └── weight_inference.py  # Graph weight refinement
├── agents/             # 7 adversarial agents
│   ├── critical_node.py      # Kill highest-impact nodes
│   ├── bridge_breaker.py     # Fragment the network
│   ├── compound_exploiter.py # Multi-node failure combinations
│   ├── layer_assassin.py     # Attack entire layers
│   ├── cluster_isolator.py   # Isolate fragile clusters
│   ├── cascading_domino.py   # Chain reaction targeting
│   └── recovery_maximizer.py # Maximize recovery cost
├── briefing/           # Analysis → agent-specific attack briefs
├── results/            # Top 10 scenario ranking + AI narrative generation
├── models/             # Graph, Node, Edge, State, Event data structures
└── main.py             # FastAPI app — 18 REST endpoints + 3 WebSocket channels
```

### Frontend Routes (~8,200 lines)

| Route | Page |
|-------|------|
| `/` | Landing page — hero, pipeline visualization, pricing, waitlist |
| `/network/:sessionId` | D3 force-directed graph with layer toggles and analysis panel |
| `/simulate/:sessionId` | Agent controls, state tree visualization, live progress |
| `/report/:sessionId` | Top 10 scenarios, cascade breakdowns, recommendations |
| `/chat/:sessionId` | Interactive Q&A about findings |

### API Surface

**REST:** upload, upload-jobs, google-drive import, graph CRUD, analyze, cascade, explore, report, chat, waitlist, health

**WebSocket:** real-time upload progress, exploration progress, chat streaming

## Testing

15 test files covering graph model, cascade engine, weakpoint analysis, state tree exploration, agents, ingestion, API endpoints, and chat.

```bash
source .venv/bin/activate
python -m pytest                        # all tests
python -m pytest tests/test_cascade.py  # single file
```

## Quick Start

```bash
./bin/setup          # install pnpm deps + create .venv + pip install backend
./bin/dev            # start API (port 8000) + frontend (port 3000)
```

Open http://localhost:3000 and upload a file. Demo dataset available at `demo/novapay.json`.

## Commands

```bash
pnpm build           # build all (via Turbo)
pnpm lint            # lint all
pnpm typecheck       # typecheck all
pnpm format          # format all
```

## Docker Deployment

```bash
cp .env.example .env
docker compose up --build -d
```

On-prem ready. See `docs/07_DEPLOYMENT.md`.

## License

Source-available, not open source. See [LICENSE](LICENSE).
