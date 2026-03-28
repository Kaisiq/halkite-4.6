# Halkantir — Organizational Stress-Testing Platform

## Architecture Overview

### What It Is

Halkantir is an organizational stress-testing platform that takes any organization's data, constructs a dependency network, mathematically identifies weakpoints, and runs adversarial simulations to find the worst-case failure scenarios — all backed by exact computation, not AI guessing.

### Core Principle

**AI generates. Math computes. AI explains.**

The AI never touches the numbers. It builds the graph from user data, generates realistic events for simulations, and translates mathematical results into human language. Every number in every output traces back to a deterministic equation.

---

## Pipeline

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐     ┌────────────────┐
│ MODULE 1     │     │ MODULE 2         │     │ MODULE 3       │     │ MODULE 4       │
│              │     │                  │     │                │     │                │
│ DATA         │────▶│ WEAKPOINT        │────▶│ AGENT          │────▶│ STATE TREE     │
│ INGESTION    │     │ ANALYSIS         │     │ BRIEFING       │     │ EXPLORATION    │
│              │     │                  │     │                │     │                │
│ User dumps   │     │ Pure math on     │     │ Analysis →     │     │ Multi-agent    │
│ files → AI   │     │ the graph:       │     │ targeted       │     │ adversarial    │
│ builds graph │     │ rankings,        │     │ attack briefs  │     │ search of      │
│              │     │ bridges,         │     │ for each       │     │ failure        │
│              │     │ clusters,        │     │ agent type     │     │ scenarios      │
│              │     │ pairs, layers    │     │                │     │                │
└──────────────┘     └──────────────────┘     └────────────────┘     └────────────────┘
        │                    │                        │                       │
        ▼                    ▼                        ▼                       ▼
   MODULE 1A            MODULE 2A               MODULE 3A              MODULE 4A
   Graph Model          Cascade Engine          Agent Strategies       Tree Storage
   (data structures)    (propagation math)      (exploration logic)    (results + ranking)
```

---

## Module Map

| Module                 | File                       | Purpose                                | AI Involved?                 |
| ---------------------- | -------------------------- | -------------------------------------- | ---------------------------- |
| 1 — Data Ingestion     | `01_DATA_INGESTION.md`     | Parse user files, AI builds graph      | Yes — graph construction     |
| 1A — Graph Model       | `01A_GRAPH_MODEL.md`       | Node/edge data structures, validation  | No                           |
| 2 — Weakpoint Analysis | `02_WEAKPOINT_ANALYSIS.md` | All analysis algorithms                | No — pure math               |
| 2A — Cascade Engine    | `02A_CASCADE_ENGINE.md`    | Cascade propagation math               | No — pure math               |
| 3 — Agent Briefing     | `03_AGENT_BRIEFING.md`     | Convert analysis → agent instructions  | No — structured mapping      |
| 3A — Agent Strategies  | `03A_AGENT_STRATEGIES.md`  | Each agent's exploration logic         | Partially — event generation |
| 4 — State Tree         | `04_STATE_TREE.md`         | Tree structure, exploration, pruning   | No — pure computation        |
| 4A — Results & Ranking | `04A_RESULTS_RANKING.md`   | Collect, rank, present worst scenarios | Yes — narrative generation   |
| 5 — API                | `05_API.md`                | FastAPI endpoints, tool definitions    | No                           |
| 6 — Frontend           | `06_FRONTEND.md`           | React + D3 visualization               | No                           |

---

## Tech Stack

| Component          | Technology                                      |
| ------------------ | ----------------------------------------------- |
| Math Engine        | Python 3.14, NetworkX, NumPy, SciPy             |
| Backend API        | FastAPI                                         |
| AI Agent           | Claude API (Anthropic)                          |
| Frontend           | React + D3.js (force-directed graph) + Recharts |
| State Tree Storage | In-memory (Python dict/tree)                    |
| File Parsing       | PyPDF2, python-docx, openpyxl, Pillow           |

---

## 48h Build Timeline

| Hours | Task                                                    | Module   |
| ----- | ------------------------------------------------------- | -------- |
| 0-4   | Graph model + cascade engine                            | 1A, 2A   |
| 4-8   | Weakpoint analysis algorithms                           | 2        |
| 8-12  | Data ingestion (AI graph builder)                       | 1        |
| 12-16 | State tree + agent strategies                           | 3, 3A, 4 |
| 16-20 | Results ranking + AI narrative                          | 4A       |
| 20-28 | Frontend — graph visualization + dashboard              | 6        |
| 28-34 | Frontend — state tree visualization + cascade animation | 6        |
| 34-40 | API integration, end-to-end flow                        | 5        |
| 40-44 | Polish, demo scenarios, edge cases                      | All      |
| 44-48 | Presentation prep, rehearsal                            | —        |
