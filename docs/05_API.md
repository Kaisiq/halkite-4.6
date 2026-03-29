# Module 5 — API

## Purpose

FastAPI backend that connects all modules. Exposes endpoints for the frontend to trigger each pipeline step and retrieve results.

---

## Tech

```
Framework: FastAPI
Server: Uvicorn
Dependencies: networkx, numpy, scipy, anthropic, python-multipart
Port: 8000
```

---

## Endpoints

### POST /api/upload

Upload files for data ingestion (Module 1).

```
Request:
    Content-Type: multipart/form-data
    Body: files[] (one or more files)
    Optional: description (text field — user's verbal description)

Response:
{
    "session_id": "uuid",
    "files_parsed": [
        {"filename": "employees.xlsx", "type": "xlsx", "chars_extracted": 4520}
    ],
    "graph": Graph,              // Module 1A schema
    "r_unit": "days",
    "confidence": 0.72,
    "gaps": ["No technology infrastructure mentioned"],
    "follow_up_questions": ["Is there a backup for your database?"]
}

Errors:
    400: No files provided
    422: Could not parse any files
    500: AI graph extraction failed
```

### POST /api/upload-jobs

Create an asynchronous ingestion job for uploaded files.

```
Request:
    Content-Type: multipart/form-data
    Body: files[] (one or more files)
    Optional: description (text field)

Response:
{
    "session_id": "uuid",
    "job_id": "uuid",
    "status": "queued"
}
```

### GET /api/upload-jobs/{job_id}

Fetch the current ingestion job state and latest graph preview.

```
Response:
{
    "job_id": "uuid",
    "session_id": "uuid",
    "status": "queued|parsing|extracting|merging|refining|completed|failed",
    "progress": 0.35,
    "stage_message": "Extracting entities from org_chart.pdf",
    "graph_preview": Graph,
    "metrics": {
        "files_total": 4,
        "files_processed": 2,
        "candidate_nodes": 14,
        "candidate_edges": 11
    },
    "error": null
}
```

### POST /api/google-drive/import

Import a Google Drive folder for data ingestion (Module 1).

```
Request:
{
    "access_token": "google_oauth_access_token",
    "folder_id": "drive_folder_id_or_url",
    "description": "optional free-text context"
}

Response:
{
    "session_id": "uuid",
    "files_parsed": [...],
    "graph": Graph,
    "r_unit": "days",
    "confidence": 0.72,
    "gaps": [...],
    "follow_up_questions": [...],
    "drive_folder": {
        "id": "folder_id",
        "name": "Operations Source",
        "file_count": 24,
        "files_skipped": 3
    }
}

Errors:
    400: Invalid folder id, Drive access failure, or no supported files found
    500: AI graph extraction failed
```

### POST /api/waitlist

Capture launch-interest emails from the landing page.

```
Request:
{
    "email": "team@company.com",
    "company": "optional company name",
    "website": ""   // honeypot field, must remain blank
}

Response:
{
    "status": "created" | "already_registered" | "accepted",
    "message": "You are on the launch list."
}

Errors:
    422: Invalid email address
    429: Rate limit exceeded for the client IP
```

### POST /api/graph/update

Manually update the graph (add/remove/edit nodes and edges).

```
Request:
{
    "session_id": "uuid",
    "operations": [
        {"op": "add_node", "node": {id, name, layer, h, theta, r}},
        {"op": "remove_node", "node_id": "string"},
        {"op": "update_node", "node_id": "string", "fields": {theta: 0.8}},
        {"op": "add_edge", "edge": {from, to, weight}},
        {"op": "remove_edge", "from": "id", "to": "id"},
        {"op": "update_edge", "from": "id", "to": "id", "weight": 0.5}
    ]
}

Response:
{
    "graph": Graph,           // Updated graph
    "validation_warnings": [] // Any issues detected
}
```

### POST /api/analyze

Run weakpoint analysis (Module 2) on the current graph.

```
Request:
{
    "session_id": "uuid"
}

Response:
{
    "vulnerability_report": VulnerabilityReport,  // Module 2 output
    "computation_time_ms": 1234
}
```

### POST /api/cascade

Run a single cascade simulation (Module 2A).

```
Request:
{
    "session_id": "uuid",
    "event": {
        "target": "node_id" | ["node_id1", "node_id2"],
        "action": "kill" | "damage" | "cut_edge",
        "magnitude": 0.8   // for "damage" action
    }
}

Response:
{
    "cascade_log": [
        {
            "step": 0,
            "trigger": "initial_event",
            "new_failures": ["CEO"],
            "new_degraded": ["CTO", "CFO"],
            "damages": {"CTO": 0.35, "CFO": 0.22}
        },
        ...
    ],
    "final_state": {
        "nodes": [{id, h, phi}],
        "H": 0.62,
        "H_per_layer": {"People": 0.45, "Technology": 0.88}
    },
    "metrics": {
        "cascade_size": 0.19,
        "cascade_depth": 3,
        "health_loss": 0.38,
        "nodes_failed": ["CEO", "Sales_Lead"],
        "cross_layer_failures": 1,
        "total_recovery_cost": 180000
    },
    "animation_frames": [...]  // For frontend animation
}
```

### POST /api/explore

Run full state tree exploration (Modules 3, 3A, 4).

```
Request:
{
    "session_id": "uuid",
    "config": {
        "max_depth": 5,           // default 5
        "max_tree_nodes": 5000,   // default 5000
        "worst_k": 10,            // default 10
        "agents": [               // optional — default all 5
            "critical_node_attacker",
            "bridge_breaker",
            "compound_exploiter",
            "layer_assassin",
            "cluster_isolator"
        ]
    }
}

Response:
{
    "tree_stats": {
        "total_nodes_explored": 2847,
        "max_depth_reached": 5,
        "computation_time_ms": 8432,
        "agent_stats": {
            "critical_node_attacker": {
                "nodes_explored": 612,
                "worst_H_found": 0.08
            },
            ...
        }
    },
    "worst_scenarios": [FinalReport.worst_scenarios],  // Module 4A output
    "recommendations": [FinalReport.recommendations],
    "visualization_data": {
        "state_tree": {
            // Simplified tree for frontend rendering
            "nodes": [{id, H, depth, agent, event_summary}],
            "edges": [{from, to}]
        },
        "cascade_animations": [...]
    }
}
```

### POST /api/explore/stream (WebSocket alternative)

### WS /ws/upload/{job_id}

Streams upload-job progress and incremental graph updates.

```
Client sends:
    {"action": "subscribe"}

Server emits:
    {"type": "job_status", "status": "...", "progress": 0.42, "stage_message": "..."}
    {"type": "node_added", "node": {...}}
    {"type": "edge_added", "edge": {...}}
    {"type": "graph_snapshot", "graph": Graph}
    {"type": "job_complete", ...final upload response...}
    {"type": "job_error", "message": "..."}
```

Stream exploration progress in real-time:

```
WebSocket: ws://localhost:8000/ws/explore/{session_id}

Client sends:
{
    "action": "start",
    "config": {...}
}

Server streams:
{"type": "agent_started", "agent": "critical_node_attacker"}
{"type": "node_explored", "depth": 1, "H": 0.72, "agent": "critical_node_attacker"}
{"type": "node_explored", "depth": 2, "H": 0.45, "agent": "critical_node_attacker"}
{"type": "new_worst", "rank": 1, "H": 0.08, "scenario_preview": "..."}
{"type": "agent_finished", "agent": "critical_node_attacker", "nodes_explored": 612}
...
{"type": "complete", "final_report": FinalReport}
```

### POST /api/reset

Reset graph to initial state (all h = 1.0, all φ = false).

```
Request:  {"session_id": "uuid"}
Response: {"graph": Graph}
```

### GET /api/graph/{session_id}

Get current graph state.

```
Response: {"graph": Graph}
```

### GET /api/report/{session_id}

Get the full final report (Module 4A output).

```
Response: FinalReport
```

---

## Session Management

```python
# In-memory session store (hackathon)
sessions = {}

# Each session holds:
sessions[session_id] = {
    "graph": Graph,
    "vulnerability_report": VulnerabilityReport | None,
    "state_tree": StateTree | None,
    "final_report": FinalReport | None,
    "created_at": datetime,
    "r_unit": "days"
}
```

For production: replace with Redis or database.

---

## Error Handling

```
All endpoints return:
{
    "error": "description",
    "code": "ERROR_CODE"
}

Error codes:
    SESSION_NOT_FOUND:   session_id doesn't exist
    GRAPH_EMPTY:         no graph built yet (run /upload first)
    ANALYSIS_NOT_RUN:    /explore called before /analyze
    INVALID_EVENT:       event references non-existent node
    INVALID_GRAPH:       graph fails validation
    AI_ERROR:            Claude API call failed
    COMPUTATION_TIMEOUT: analysis took too long
```

---

## CORS

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # Hackathon: allow all
    allow_methods=["*"],
    allow_headers=["*"],
)
```
