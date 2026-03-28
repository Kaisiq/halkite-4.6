# NEXUS Testing Plan

Step-by-step quality assurance process for reviewing the entire application.

---

## Quick Reference — Commands

```bash
# Setup (one-time)
./bin/setup

# Run everything
pnpm quality                        # lint + typecheck (both apps)
pnpm test                           # all tests
pnpm test:cov                       # backend tests with coverage

# Backend only
pnpm --filter @halkite/api lint     # ruff check
pnpm --filter @halkite/api format:check  # ruff format check
pnpm --filter @halkite/api typecheck     # mypy strict
pnpm --filter @halkite/api test          # pytest
pnpm --filter @halkite/api test:cov      # pytest + coverage
pnpm --filter @halkite/api test:unit     # fast tests only (skip slow/integration)

# Frontend only
pnpm --filter @halkite/web lint          # eslint
pnpm --filter @halkite/web typecheck     # tsc --noEmit
pnpm --filter @halkite/web build         # next build (catches runtime issues)

# Formatting
pnpm format:check                   # prettier (global)
pnpm --filter @halkite/api format:check  # ruff format (python)
```

---

## Phase 1 — Static Analysis (no runtime, ~30 seconds)

Run these first. They catch issues without executing any code.

### Step 1.1: Python linting (Ruff)

```bash
pnpm --filter @halkite/api lint
```

**Rules enforced:** pycodestyle, pyflakes, isort, bugbear, pyupgrade, pep8-naming, bandit (security), builtins, comprehensions, simplify, type-checking, pytest-style, return.

**What to look for:**
- [ ] Zero errors
- [ ] No security warnings (S rules) in production code
- [ ] Imports sorted correctly (I rules)

### Step 1.2: Python formatting (Ruff)

```bash
pnpm --filter @halkite/api format:check
```

**What to look for:**
- [ ] All files formatted consistently (double quotes, 4-space indent, LF line endings)

### Step 1.3: Python type checking (MyPy)

```bash
pnpm --filter @halkite/api typecheck
```

**Configuration:** strict mode, all warnings enabled.

**What to look for:**
- [ ] Zero type errors
- [ ] No `Any` types leaking into public APIs
- [ ] Third-party library stubs accounted for (numpy, networkx, etc.)

### Step 1.4: TypeScript type checking

```bash
pnpm --filter @halkite/web typecheck
```

**What to look for:**
- [ ] Zero TypeScript errors
- [ ] No implicit `any` types

### Step 1.5: Frontend linting (ESLint)

```bash
pnpm --filter @halkite/web lint
```

**Rules enforced:** next/core-web-vitals, react-hooks/rules-of-hooks, no-duplicate-imports.

**What to look for:**
- [ ] Zero errors
- [ ] No React hook violations

### Step 1.6: Prettier (global)

```bash
pnpm format:check
```

**What to look for:**
- [ ] All JS/TS/JSON/MD files formatted consistently

---

## Phase 2 — Unit Tests (isolated, fast, ~20 seconds)

These test individual modules in isolation. No network calls, no AI API.

```bash
pnpm --filter @halkite/api test:unit
```

### Step 2.1: Graph Model (`test_graph.py`)

Tests the core data structures from Module 1A.

| Test | Validates |
|------|-----------|
| Node creation | Default h=1.0, phi=False |
| Node.from_dict | JSON deserialization, missing-layer KeyError |
| Graph init | Adjacency matrix shape, node/edge counts |
| network_health | theta-weighted average = 1.0 when pristine |
| network_health (damaged) | H < 1.0 after manual damage |
| layer_health | Per-layer computation |
| snapshot | State captures h, phi, H, H_per_layer |
| deep_copy | Independence from original |
| reset | All h=1.0, phi=False restored |
| validate | Valid graph passes, self-loops rejected |

**What to look for:**
- [ ] All pass
- [ ] Health formula: H = sum(h_i * theta_i) / sum(theta_i)

### Step 2.2: Cascade Engine (`test_cascade.py`)

Tests the deterministic cascade propagation from Module 2A.

| Test | Validates |
|------|-----------|
| kill event | h=0, phi=True |
| damage event | h *= (1 - magnitude) |
| cascade propagation | Downstream damage spreads |
| cascade metrics | health_loss, cascade_size, nodes_failed |
| already-dead node | Silently skipped |
| nonexistent node | ValueError raised |
| compound cascade | Multiple events, events logged |
| zero-theta node | No damage propagates |
| determinism | Same input → same output |
| convergence | Cascade terminates |
| cross-layer metric | Accurate attribution |

**What to look for:**
- [ ] All pass
- [ ] Cascade reaches fixed point (no infinite loops)
- [ ] Damage formula: damage = A[u][v] * theta_v * (1 - h_v)

### Step 2.3: Weakpoint Analysis (`test_weakpoint.py`)

Tests all 6 analysis algorithms from Module 2.

| Test | Validates |
|------|-----------|
| Node impact ranking | Ordered by health_loss, CEO at top |
| Critical edge detection | One entry per edge |
| Bridge node detection | Fragmentation score in [0, 1] |
| Cluster detection | At least 1 cluster, isolation_risk > 0 |
| Compound pairs | Synergy values computed |
| Layer dependency | All layers present, autonomy in [0, 1] |
| Full analysis | VulnerabilityReport has all 7 sections |

**What to look for:**
- [ ] All pass
- [ ] Top-ranked node is the most connected/critical

### Step 2.4: Agents & Briefing (`test_agents.py`)

Tests Modules 3 and 3A.

| Test | Validates |
|------|-----------|
| generate_all_briefs | 5 briefs with correct agent_types |
| create_all_agents | 5 agents of correct subclass types |
| Each agent's select_events | Returns valid Event list |
| Branching factor | Output size <= branching_factor |
| Dead network | Empty list when all nodes dead |

**What to look for:**
- [ ] All pass
- [ ] Every agent returns well-formed Event objects

### Step 2.5: State Tree (`test_state_tree.py`)

Tests Module 4.

| Test | Validates |
|------|-----------|
| build_state_tree | Root exists, nodes explored > 0 |
| Root health | H = 1.0 for pristine graph |
| Depth limit | max_depth_reached <= config.max_depth |
| Size limit | total_nodes_explored <= config.max_tree_nodes |
| Worst scenarios | Sorted by H ascending |
| Backpropagation | root.worst_descendant_H matches |
| extract_path | Returns node IDs, not array indices |
| Duplicate pruning | Same failure set not explored twice |

**What to look for:**
- [ ] All pass
- [ ] Tree is pruned correctly

### Step 2.6: Results & Ranking (`test_results.py`)

Tests Module 4A.

| Test | Validates |
|------|-----------|
| extract_scenarios | Sorted by severity descending |
| Severity range | All values in [0, 1] |
| Deduplication | Same failure set → one scenario |
| Recommendations | At least one generated |
| Animation frames | Frame 0 = initial state |
| Final report | All sections populated |
| visualization_data | Contains state_tree key |

**What to look for:**
- [ ] All pass
- [ ] Severity formula: 0.5*health_lost + 0.2*failed_fraction + 0.15*layers_ratio + 0.15*recovery_ratio

---

## Phase 3 — Integration Tests (modules working together, ~30 seconds)

### Step 3.1: API Route Tests (`test_api.py`)

Tests the FastAPI endpoints with an in-process test client (httpx).

| Test | Validates |
|------|-----------|
| GET /api/health | Returns 200, {"status": "ok"} |
| POST /api/analyze (no graph) | Returns 400, GRAPH_EMPTY |
| POST /api/cascade (no graph) | Returns 400, GRAPH_EMPTY |
| POST /api/explore (no analysis) | Returns 400, ANALYSIS_NOT_RUN |
| GET /api/graph/invalid | Returns 404, SESSION_NOT_FOUND |
| POST /api/graph/update | Add node, verify in response |
| Full pipeline | Upload → analyze → explore → report |

**What to look for:**
- [ ] All pass
- [ ] Error codes match spec (SESSION_NOT_FOUND, GRAPH_EMPTY, etc.)
- [ ] Response shapes match `docs/05_API.md`

### Step 3.2: Full Pipeline Test (marked `@pytest.mark.slow`)

```bash
pnpm --filter @halkite/api test  # includes slow tests
```

This test creates a graph, runs analysis, exploration, and report generation end-to-end. It validates that every module integrates correctly.

**What to look for:**
- [ ] No crashes through the full pipeline
- [ ] Final report has scenarios with real node IDs
- [ ] Recommendations reference actual nodes

---

## Phase 4 — Coverage Report

```bash
pnpm --filter @halkite/api test:cov
```

**Coverage targets:**

| Module | Target | Rationale |
|--------|--------|-----------|
| `models/graph.py` | 90%+ | Core data structure, must be solid |
| `models/events.py` | 95%+ | Small, fully testable |
| `engine/cascade.py` | 85%+ | Core math, critical correctness |
| `engine/weakpoint.py` | 75%+ | 6 algorithms, complex branches |
| `engine/state_tree.py` | 80%+ | Tree construction + pruning |
| `agents/*.py` | 70%+ | Strategy logic varies |
| `briefing/briefing.py` | 80%+ | Deterministic mapping |
| `results/ranking.py` | 65%+ | Large file, some paths need AI |
| `ingestion/*.py` | 50%+ | AI-dependent paths can't be unit tested |
| `main.py` | 70%+ | Route handlers |
| **Overall** | **60%+** | Configured as `fail_under` in pyproject.toml |

**What to look for:**
- [ ] Overall coverage >= 60%
- [ ] No critical module below its target
- [ ] Identify uncovered branches for future test additions

---

## Phase 5 — Build Verification

### Step 5.1: Backend compiles

```bash
pnpm --filter @halkite/api build
```

### Step 5.2: Frontend builds

```bash
pnpm --filter @halkite/web build
```

**What to look for:**
- [ ] Both build without errors
- [ ] Frontend routes: /, /network/[sessionId], /simulate/[sessionId], /report/[sessionId]
- [ ] No TypeScript errors during build

---

## Phase 6 — Manual Smoke Test (requires running servers)

Start the development servers:

```bash
./bin/dev
```

### Step 6.1: Backend API smoke test

```bash
# Health check
curl http://localhost:8000/api/health
# Expected: {"status":"ok"}

# Verify OpenAPI docs load
curl -s http://localhost:8000/docs | head -5
# Expected: HTML page
```

- [ ] Health endpoint returns 200
- [ ] Swagger UI loads at /docs

### Step 6.2: Frontend loads

Open http://localhost:3000 in a browser.

- [ ] NEXUS landing page renders
- [ ] Dark theme with gradient background
- [ ] File drop zone visible
- [ ] "Build Network" button visible

### Step 6.3: File upload flow

1. Prepare a test file (e.g., a CSV with columns: Name, Role, Department, Reports_To)
2. Drop or upload the file
3. Optionally add a text description

- [ ] File appears in upload list with type badge
- [ ] "Build Network" button activates
- [ ] Loading spinner appears after clicking
- [ ] On success: redirected to /network/{sessionId}

### Step 6.4: Network view

- [ ] D3 force-directed graph renders
- [ ] Nodes colored by layer
- [ ] Node sizes proportional to theta
- [ ] Edges visible with direction arrows
- [ ] Click node → detail panel shows h, theta, r
- [ ] Layer toggle checkboxes work
- [ ] "Run Analysis" button works
- [ ] After analysis: risk rankings, bridge count, cluster count visible

### Step 6.5: Cascade simulation

1. Select a node on the graph
2. Click "Kill Node"

- [ ] Cascade runs
- [ ] Node visuals update (opacity, color)
- [ ] Health score updates in panel

### Step 6.6: State tree exploration

1. Navigate to Simulate tab
2. Select agents, set depth/limit
3. Click "Run Exploration"

- [ ] Loading spinner during exploration
- [ ] Tree visualization renders after completion
- [ ] Per-agent stats visible
- [ ] "View Full Report" navigates to report page

### Step 6.7: Report page

- [ ] Scenario cards render with severity badges
- [ ] Cards expand/collapse on click
- [ ] Step-by-step cascade breakdown visible
- [ ] Recommendations section populated
- [ ] "View on Network" button navigates back

---

## Phase 7 — Security Review Checklist

- [ ] No hardcoded API keys in source (grep for `sk-`, `ANTHROPIC_API_KEY=`)
- [ ] `.env` files are in `.gitignore`
- [ ] CORS is configured (currently `allow_origins=["*"]` — acceptable for hackathon)
- [ ] File uploads are bounded (FastAPI default limits apply)
- [ ] No SQL injection vectors (no SQL in this project)
- [ ] No command injection (no shell exec from user input)
- [ ] User input is sanitized before passing to AI prompts (context is text-only)

---

## Phase 8 — Performance Sanity Check

For a graph with ~20 nodes, ~30 edges:

| Operation | Expected Time |
|-----------|---------------|
| Cascade (single kill) | < 50ms |
| Full weakpoint analysis | < 2s |
| State tree exploration (depth=5, limit=5000) | < 30s |
| Frontend initial render | < 2s |
| D3 graph render | < 1s |

- [ ] No operation hangs or takes unreasonably long
- [ ] Memory usage stays reasonable (< 500MB for the Python process)

---

## CI/CD Pipeline (Recommended)

For automated enforcement, configure a CI pipeline that runs:

```yaml
# .github/workflows/ci.yml (example)
jobs:
  quality:
    steps:
      - run: pnpm install
      - run: ./bin/setup
      - run: pnpm quality        # lint + typecheck
      - run: pnpm format:check   # formatting
      - run: pnpm test:cov       # tests + coverage
      - run: pnpm build          # build both apps
```

**Gate rules:**
- All lint checks pass
- All type checks pass
- All tests pass
- Coverage >= 60%
- Both apps build successfully

---

## Test File Map

```
apps/api/tests/
├── __init__.py
├── conftest.py           # Shared fixtures (small_graph, medium_graph)
├── test_graph.py         # Module 1A — Graph Model
├── test_cascade.py       # Module 2A — Cascade Engine
├── test_weakpoint.py     # Module 2  — Weakpoint Analysis
├── test_agents.py        # Modules 3/3A — Agents + Briefing
├── test_state_tree.py    # Module 4  — State Tree
├── test_results.py       # Module 4A — Results & Ranking
└── test_api.py           # Module 5  — API Routes
```

---

## Execution Order

Run phases in this order. Stop and fix issues before proceeding.

1. **Phase 1** — Static analysis (lint, types, format) — catches ~60% of bugs instantly
2. **Phase 2** — Unit tests — validates each module's math and logic
3. **Phase 3** — Integration tests — validates modules work together
4. **Phase 4** — Coverage report — identifies gaps
5. **Phase 5** — Build verification — catches bundling issues
6. **Phase 6** — Manual smoke test — validates the user experience
7. **Phase 7** — Security checklist — one-time review
8. **Phase 8** — Performance check — ensures acceptable response times
