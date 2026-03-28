from __future__ import annotations

import os
import time
import traceback
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from nexus_api.session import SessionNotFoundError, store

_REQUIRED_ENV_VARS = ("GEMINI_API_KEY",)


def _load_env_files() -> None:
    """Load simple KEY=VALUE pairs from repo env files into os.environ.

    Precedence is:
    1. Existing process environment
    2. `apps/api/.env`
    3. repo root `.env`
    """
    api_dir = Path(__file__).resolve().parents[2]
    root_dir = Path(__file__).resolve().parents[4]
    env_files = [
        root_dir / ".env",
        api_dir / ".env",
    ]

    for env_file in env_files:
        if not env_file.exists():
            continue

        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key:
                os.environ.setdefault(key, value)


def _validate_required_env() -> None:
    """Fail fast when required runtime configuration is missing."""
    missing = [key for key in _REQUIRED_ENV_VARS if not os.environ.get(key, "").strip()]
    if not missing:
        return

    missing_list = ", ".join(missing)
    raise RuntimeError(
        "Missing required API environment variables: "
        f"{missing_list}. Set them before starting the API."
    )


_load_env_files()
_validate_required_env()

app = FastAPI(
    title="NEXUS API",
    version="0.1.0",
    description="Backend for the NEXUS network survival analyzer.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Error helpers
# ---------------------------------------------------------------------------

def error_response(code: str, message: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": message, "code": code}, status_code=status)


@app.exception_handler(SessionNotFoundError)
async def _handle_session_not_found(request: Any, exc: SessionNotFoundError) -> JSONResponse:
    return error_response("SESSION_NOT_FOUND", str(exc), 404)


# ---------------------------------------------------------------------------
# Pydantic request bodies
# ---------------------------------------------------------------------------

class GraphUpdateRequest(BaseModel):
    session_id: str
    operations: list[dict[str, Any]]


class AnalyzeRequest(BaseModel):
    session_id: str


class CascadeRequest(BaseModel):
    session_id: str
    event: dict[str, Any]


class ExploreRequest(BaseModel):
    session_id: str
    config: dict[str, Any] | None = None


class ResetRequest(BaseModel):
    session_id: str


class GoogleDriveImportRequest(BaseModel):
    access_token: str
    folder_id: str
    description: str = ""


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def _serialize_graph(graph: Any) -> dict[str, Any]:
    from nexus_api.models.graph import Graph
    g: Graph = graph
    return {
        "layers": list(g.layers),
        "nodes": [
            {
                "id": n.id,
                "name": n.name,
                "layer": n.layer,
                "h": round(n.h, 6),
                "theta": round(n.theta, 6),
                "r": round(n.r, 4),
                "phi": n.phi,
                "meta": n.meta,
            }
            for n in g.nodes
        ],
        "edges": [
            {
                "from": e.from_id,
                "to": e.to_id,
                "weight": round(e.weight, 6),
            }
            for e in g.edges
        ],
    }


def _serialize_state(state: Any) -> dict[str, Any]:
    from nexus_api.models.graph import State
    s: State = state
    return {
        "h": [round(v, 6) for v in s.h],
        "phi": list(s.phi),
        "H": round(s.H, 6),
        "H_per_layer": {k: round(v, 6) for k, v in s.H_per_layer.items()},
    }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /api/upload
# ---------------------------------------------------------------------------

@app.post("/api/upload")
async def upload_files(
    files: list[UploadFile] = File(...),
    description: str = Form(""),
) -> JSONResponse:
    if not files:
        return error_response("INVALID_REQUEST", "No files provided", 400)

    try:
        from nexus_api.ingestion.extractor import ingest

        raw_files: list[tuple[str, bytes]] = []
        for f in files:
            content = await f.read()
            raw_files.append((f.filename or "unknown", content))

        result = await ingest(raw_files, description)

        session = store.create()
        session.graph = result.graph
        session.r_unit = result.r_unit

        return JSONResponse({
            "session_id": session.session_id,
            "files_parsed": result.files_parsed,
            "graph": _serialize_graph(result.graph),
            "r_unit": result.r_unit,
            "confidence": result.confidence,
            "gaps": result.gaps,
            "follow_up_questions": result.follow_up_questions,
        })
    except Exception as e:
        traceback.print_exc()
        return error_response("AI_ERROR", f"Graph extraction failed: {e}", 500)


@app.post("/api/google-drive/import")
async def import_google_drive_folder(body: GoogleDriveImportRequest) -> JSONResponse:
    try:
        from nexus_api.ingestion.extractor import ingest
        from nexus_api.ingestion.google_drive import (
            GoogleDriveImportError,
            extract_folder_id,
            import_drive_folder,
        )

        folder_id = extract_folder_id(body.folder_id)
        drive_bundle = import_drive_folder(body.access_token, folder_id)
        result = await ingest(drive_bundle.files, body.description)

        session = store.create()
        session.graph = result.graph
        session.r_unit = result.r_unit

        return JSONResponse(
            {
                "session_id": session.session_id,
                "files_parsed": result.files_parsed,
                "graph": _serialize_graph(result.graph),
                "r_unit": result.r_unit,
                "confidence": result.confidence,
                "gaps": result.gaps,
                "follow_up_questions": result.follow_up_questions,
                "drive_folder": drive_bundle.folder.to_dict(),
            }
        )
    except GoogleDriveImportError as exc:
        return error_response("GOOGLE_DRIVE_ERROR", str(exc), 400)
    except Exception as exc:
        traceback.print_exc()
        return error_response("AI_ERROR", f"Graph extraction failed: {exc}", 500)


# ---------------------------------------------------------------------------
# POST /api/graph/update
# ---------------------------------------------------------------------------

@app.post("/api/graph/update")
async def update_graph(body: GraphUpdateRequest) -> JSONResponse:
    session = store.require(body.session_id)
    if session.graph is None:
        return error_response("GRAPH_EMPTY", "No graph built yet. Run /api/upload first.", 400)

    from nexus_api.models.graph import Edge, Graph, Node

    graph: Graph = session.graph
    warnings: list[str] = []

    for op in body.operations:
        op_type = op.get("op", "")
        try:
            if op_type == "add_node":
                nd = op["node"]
                node = Node(
                    id=nd["id"], name=nd["name"], layer=nd["layer"],
                    h=nd.get("h", 1.0), theta=nd.get("theta", 0.5),
                    r=nd.get("r", 0.0), meta=nd.get("meta", {}),
                )
                if node.layer not in graph.layers:
                    graph.layers.append(node.layer)
                graph.nodes.append(node)
            elif op_type == "remove_node":
                nid = op["node_id"]
                graph.nodes = [n for n in graph.nodes if n.id != nid]
                graph.edges = [e for e in graph.edges if e.from_id != nid and e.to_id != nid]
            elif op_type == "update_node":
                nid = op["node_id"]
                fields = op.get("fields", {})
                try:
                    node = graph.get_node(nid)
                except KeyError:
                    warnings.append(f"Node {nid} not found")
                    continue
                for k, v in fields.items():
                    if hasattr(node, k):
                        setattr(node, k, v)
            elif op_type == "add_edge":
                ed = op["edge"]
                edge = Edge(from_id=ed["from"], to_id=ed["to"], weight=ed.get("weight", 0.5))
                graph.edges.append(edge)
            elif op_type == "remove_edge":
                graph.remove_edge(op["from"], op["to"])
            elif op_type == "update_edge":
                for e in graph.edges:
                    if e.from_id == op["from"] and e.to_id == op["to"]:
                        e.weight = op["weight"]
                        break
            else:
                warnings.append(f"Unknown operation: {op_type}")
        except Exception as exc:
            warnings.append(f"Operation {op_type} failed: {exc}")

    graph.rebuild()
    session.graph = graph

    return JSONResponse({
        "graph": _serialize_graph(graph),
        "validation_warnings": warnings,
    })


# ---------------------------------------------------------------------------
# POST /api/analyze
# ---------------------------------------------------------------------------

@app.post("/api/analyze")
async def analyze(body: AnalyzeRequest) -> JSONResponse:
    session = store.require(body.session_id)
    if session.graph is None:
        return error_response("GRAPH_EMPTY", "No graph built yet.", 400)

    from nexus_api.engine.weakpoint import run_full_analysis

    t0 = time.perf_counter()
    report = run_full_analysis(session.graph)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    session.vulnerability_report = report

    return JSONResponse({
        "vulnerability_report": _serialize_vulnerability_report(report),
        "computation_time_ms": elapsed_ms,
    })


def _serialize_vulnerability_report(report: Any) -> dict[str, Any]:
    return {
        "network_health": round(report.network_health, 6),
        "node_rankings": [
            {
                "node_id": nr.node_id,
                "health_loss": round(nr.health_loss, 6),
                "cascade_size": round(nr.cascade_size, 6),
                "cascade_depth": nr.cascade_depth,
                "recovery_cost": round(nr.recovery_cost, 4),
                "layers_affected": nr.layers_affected,
            }
            for nr in report.node_rankings
        ],
        "critical_edges": [
            {
                "from_node": ce.from_node,
                "to_node": ce.to_node,
                "health_loss": round(ce.health_loss, 6),
                "crosses_layers": ce.crosses_layers,
                "weight": round(ce.weight, 6),
            }
            for ce in report.critical_edges
        ],
        "bridge_nodes": [
            {
                "node_id": bn.node_id,
                "splits_into": bn.splits_into,
                "fragmentation_score": round(bn.fragmentation_score, 6),
                "layer": bn.layer,
            }
            for bn in report.bridge_nodes
        ],
        "clusters": [
            {
                "nodes": cl.nodes,
                "size": cl.size,
                "isolation_risk": (
                    round(cl.isolation_risk, 6)
                    if cl.isolation_risk != float("inf") else 999.0
                ),
                "boundary_nodes": cl.boundary_nodes,
                "cluster_impact": round(cl.cluster_impact, 6),
                "layer_distribution": cl.layer_distribution,
            }
            for cl in report.clusters
        ],
        "compound_pairs": [
            {
                "node_a": cp.node_a,
                "node_b": cp.node_b,
                "impact_a": round(cp.impact_a, 6),
                "impact_b": round(cp.impact_b, 6),
                "impact_combined": round(cp.impact_combined, 6),
                "synergy": round(cp.synergy, 6),
                "synergy_ratio": round(cp.synergy_ratio, 6),
                "same_layer": cp.same_layer,
            }
            for cp in report.compound_pairs
        ],
        "layer_analysis": {
            layer: {
                "node_count": la.node_count,
                "autonomy": round(la.autonomy, 6),
                "criticality": round(la.criticality, 6),
                "avg_theta": round(la.avg_theta, 6),
                "avg_recovery": round(la.avg_recovery, 4),
                "layer_health": round(la.layer_health, 6),
                "risk_score": round(la.risk_score, 6),
            }
            for layer, la in report.layer_analysis.items()
        },
        "summary_stats": {
            "total_nodes": report.summary_stats.total_nodes,
            "total_edges": report.summary_stats.total_edges,
            "total_layers": report.summary_stats.total_layers,
            "most_critical_node": report.summary_stats.most_critical_node,
            "most_fragile_layer": report.summary_stats.most_fragile_layer,
            "highest_synergy_pair": list(report.summary_stats.highest_synergy_pair)
            if report.summary_stats.highest_synergy_pair else None,
            "bridge_count": report.summary_stats.bridge_count,
            "cluster_count": report.summary_stats.cluster_count,
        },
    }


# ---------------------------------------------------------------------------
# POST /api/cascade
# ---------------------------------------------------------------------------

@app.post("/api/cascade")
async def run_cascade(body: CascadeRequest) -> JSONResponse:
    session = store.require(body.session_id)
    if session.graph is None:
        return error_response("GRAPH_EMPTY", "No graph built yet.", 400)

    from nexus_api.engine.cascade import cascade
    from nexus_api.models.events import Event

    ev_data = body.event
    try:
        event = Event(
            target=ev_data["target"],
            action=ev_data.get("action", "kill"),
            magnitude=ev_data.get("magnitude", 1.0),
        )
    except (KeyError, TypeError) as e:
        return error_response("INVALID_EVENT", f"Invalid event: {e}", 400)

    graph = session.graph.deep_copy()
    try:
        cascade_log, final_state, metrics = cascade(graph, event)
    except ValueError as e:
        return error_response("INVALID_EVENT", str(e), 400)

    return JSONResponse({
        "cascade_log": [
            {
                "step": step.step,
                "trigger": step.trigger,
                "new_failures": step.new_failures,
                "new_degraded": step.new_degraded,
                "damages": {k: round(v, 6) for k, v in step.damages.items()},
            }
            for step in cascade_log
        ],
        "final_state": {
            "nodes": [
                {"id": n.id, "h": round(n.h, 6), "phi": n.phi}
                for n in graph.nodes
            ],
            "H": round(final_state.H, 6),
            "H_per_layer": {k: round(v, 6) for k, v in final_state.H_per_layer.items()},
        },
        "metrics": {
            "cascade_size": round(metrics.cascade_size, 6),
            "cascade_depth": metrics.cascade_depth,
            "health_loss": round(metrics.health_loss, 6),
            "nodes_failed": metrics.nodes_failed,
            "nodes_degraded": metrics.nodes_degraded,
            "cross_layer_failures": metrics.cross_layer_failures,
            "layer_damage": {k: round(v, 6) for k, v in metrics.layer_damage.items()},
            "total_recovery_cost": round(metrics.total_recovery_cost, 4),
        },
    })


# ---------------------------------------------------------------------------
# POST /api/explore
# ---------------------------------------------------------------------------

@app.post("/api/explore")
async def explore(body: ExploreRequest) -> JSONResponse:
    session = store.require(body.session_id)
    if session.graph is None:
        return error_response("GRAPH_EMPTY", "No graph built yet.", 400)
    if session.vulnerability_report is None:
        return error_response("ANALYSIS_NOT_RUN", "Run /api/analyze first.", 400)

    from nexus_api.briefing.briefing import create_all_agents, generate_all_briefs
    from nexus_api.engine.state_tree import ExplorationConfig, build_state_tree, tree_stats
    from nexus_api.results.ranking import build_final_report

    config_data = body.config or {}
    config = ExplorationConfig(
        max_depth=config_data.get("max_depth", 5),
        max_tree_nodes=config_data.get("max_tree_nodes", 5000),
        worst_k=config_data.get("worst_k", 10),
    )

    agent_filter = config_data.get("agents")

    t0 = time.perf_counter()

    briefs = generate_all_briefs(session.vulnerability_report, session.graph)
    if agent_filter:
        briefs = [b for b in briefs if b.agent_type in agent_filter]

    agents = create_all_agents(briefs)
    tree = build_state_tree(session.graph, agents, config)
    session.state_tree = tree

    report = build_final_report(session.graph, tree, session.vulnerability_report)
    session.final_report = report

    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    stats = tree_stats(tree)
    stats["computation_time_ms"] = elapsed_ms

    return JSONResponse({
        "tree_stats": _serialize_tree_stats(stats),
        "worst_scenarios": _serialize_scenarios(report.worst_scenarios),
        "recommendations": _serialize_recommendations(report.recommendations),
        "visualization_data": _serialize_viz_data(report, session.graph),
    })


def _serialize_tree_stats(stats: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "total_nodes_explored": stats.get("total_nodes", 0),
        "max_depth_reached": stats.get("max_depth", 0),
        "computation_time_ms": stats.get("computation_time_ms", 0),
    }
    agent_stats = stats.get("agent_stats", {})
    result["agent_stats"] = {
        atype: {
            "nodes_explored": astat.get("nodes_explored", 0),
            "worst_H_found": round(astat.get("worst_H_found", 1.0), 6),
        }
        for atype, astat in agent_stats.items()
    }
    return result


def _serialize_scenarios(scenarios: list[Any]) -> list[dict[str, Any]]:
    result = []
    for s in scenarios:
        result.append({
            "rank": s.rank,
            "severity": round(s.severity, 6),
            "severity_label": s.severity_label,
            "title": s.title,
            "summary": s.summary,
            "health_remaining": round(s.health_remaining, 6),
            "failed_nodes": s.failed_nodes,
            "recovery_cost": round(s.recovery_cost, 4),
            "depth": s.depth,
            "agent": s.agent,
            "path": [
                {
                    "step": step.get("step", 0),
                    "event": _serialize_event(step.get("event")),
                    "H_before": round(step.get("H_before", 1.0), 6),
                    "H_after": round(step.get("H_after", 1.0), 6),
                    "new_failures": step.get("new_failures", []),
                }
                for step in (s.path or [])
            ],
            "narrative": s.narrative,
            "recommendations": [
                {"action": r.get("action", "") if isinstance(r, dict) else getattr(r, "action", ""),
                 "reason": r.get("reason", "") if isinstance(r, dict) else getattr(r, "reason", "")}
                for r in (s.recommendations or [])
            ] if s.recommendations else [],
        })
    return result


def _serialize_event(event: Any) -> dict[str, Any] | None:
    if event is None:
        return None
    return {
        "target": event.target,
        "action": event.action,
        "magnitude": event.magnitude,
    }


def _serialize_recommendations(recs: list[Any]) -> list[dict[str, Any]]:
    return [
        {
            "priority": r.priority,
            "type": r.type,
            "target": r.target,
            "action": r.action,
            "reason": r.reason,
            "estimated_resilience_gain": r.estimated_resilience_gain,
            "scenarios_prevented": r.scenarios_prevented,
        }
        for r in recs
    ]


def _serialize_viz_data(report: Any, graph: Any) -> dict[str, Any]:
    tree_nodes = []
    tree_edges = []
    if report.visualization_data and report.visualization_data.get("state_tree"):
        st = report.visualization_data["state_tree"]
        tree_nodes = st.get("nodes", [])
        tree_edges = st.get("edges", [])

    return {
        "graph": _serialize_graph(graph),
        "state_tree": {
            "nodes": tree_nodes,
            "edges": tree_edges,
        },
        "cascade_animations": report.visualization_data.get("cascade_animations", [])
        if report.visualization_data else [],
    }


# ---------------------------------------------------------------------------
# POST /api/reset
# ---------------------------------------------------------------------------

@app.post("/api/reset")
async def reset_graph(body: ResetRequest) -> JSONResponse:
    session = store.require(body.session_id)
    if session.graph is None:
        return error_response("GRAPH_EMPTY", "No graph to reset.", 400)

    session.graph.reset()
    session.vulnerability_report = None
    session.state_tree = None
    session.final_report = None

    return JSONResponse({"graph": _serialize_graph(session.graph)})


# ---------------------------------------------------------------------------
# GET /api/graph/{session_id}
# ---------------------------------------------------------------------------

@app.get("/api/graph/{session_id}")
async def get_graph(session_id: str) -> JSONResponse:
    session = store.require(session_id)
    if session.graph is None:
        return error_response("GRAPH_EMPTY", "No graph built yet.", 400)
    return JSONResponse({"graph": _serialize_graph(session.graph)})


# ---------------------------------------------------------------------------
# GET /api/report/{session_id}
# ---------------------------------------------------------------------------

@app.get("/api/report/{session_id}")
async def get_report(session_id: str) -> JSONResponse:
    session = store.require(session_id)
    if session.final_report is None:
        return error_response(
            "ANALYSIS_NOT_RUN",
            "No report generated. Run /api/explore first.",
            400,
        )

    report = session.final_report
    return JSONResponse({
        "metadata": report.metadata,
        "network_health": report.network_health,
        "vulnerability_summary": report.vulnerability_summary,
        "worst_scenarios": _serialize_scenarios(report.worst_scenarios),
        "recommendations": _serialize_recommendations(report.recommendations),
        "visualization_data": _serialize_viz_data(report, session.graph),
    })


# ---------------------------------------------------------------------------
# WebSocket /ws/explore/{session_id}
# ---------------------------------------------------------------------------

@app.websocket("/ws/explore/{session_id}")
async def ws_explore(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    session = store.get(session_id)
    if session is None:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return
    if session.graph is None:
        await websocket.send_json({"type": "error", "message": "No graph built"})
        await websocket.close()
        return

    try:
        data = await websocket.receive_json()
        if data.get("action") != "start":
            await websocket.send_json({"type": "error", "message": "Send {action: 'start'}"})
            await websocket.close()
            return

        if session.vulnerability_report is None:
            from nexus_api.engine.weakpoint import run_full_analysis
            session.vulnerability_report = run_full_analysis(session.graph)

        from nexus_api.briefing.briefing import create_all_agents, generate_all_briefs
        from nexus_api.engine.state_tree import ExplorationConfig, build_state_tree, tree_stats
        from nexus_api.results.ranking import build_final_report

        ws_config = data.get("config", {})
        config = ExplorationConfig(
            max_depth=ws_config.get("max_depth", 5),
            max_tree_nodes=ws_config.get("max_tree_nodes", 5000),
            worst_k=ws_config.get("worst_k", 10),
        )

        briefs = generate_all_briefs(session.vulnerability_report, session.graph)
        agents = create_all_agents(briefs)

        for agent in agents:
            await websocket.send_json({
                "type": "agent_started",
                "agent": agent.brief.agent_type,
            })

        tree = build_state_tree(session.graph, agents, config)
        session.state_tree = tree

        stats = tree_stats(tree)
        for agent_type, astat in stats.get("agent_stats", {}).items():
            await websocket.send_json({
                "type": "agent_finished",
                "agent": agent_type,
                "nodes_explored": astat.get("nodes_explored", 0),
            })

        report = build_final_report(session.graph, tree, session.vulnerability_report)
        session.final_report = report

        await websocket.send_json({
            "type": "complete",
            "tree_stats": _serialize_tree_stats(stats),
            "worst_scenarios": _serialize_scenarios(report.worst_scenarios),
            "recommendations": _serialize_recommendations(report.recommendations),
        })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
