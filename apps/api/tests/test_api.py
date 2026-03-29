"""Tests for the Halkantir FastAPI routes (Module 5).

Covers health, analyze, cascade, explore, graph, and reset endpoints
from ``nexus_api.main``.  Uses httpx AsyncClient with ASGITransport
for all requests.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from nexus_api.main import _run_upload_job, app
from nexus_api.models.graph import Edge, Graph, Node
from nexus_api.session import store
from nexus_api.upload_jobs import upload_jobs

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _transport() -> ASGITransport:
    return ASGITransport(app=app)


def _base_url() -> str:
    return "http://testserver"


def test_api_bootstrap_requires_env(monkeypatch: pytest.MonkeyPatch) -> None:
    from nexus_api import main as api_main

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    with pytest.raises(RuntimeError, match="Missing required API environment variables"):
        api_main._validate_required_env()


def _create_session_with_graph() -> str:
    """Create a session with a small graph injected directly into the store.

    Returns the session_id.
    """
    session = store.create()
    session.graph = Graph(
        nodes=[
            Node("ceo", "CEO", "People", theta=0.9, r=180),
            Node("cto", "CTO", "People", theta=0.7, r=120),
            Node("server", "Main Server", "Technology", theta=0.8, r=1),
            Node("dev", "Dev Team", "People", theta=0.4, r=30),
        ],
        edges=[
            Edge("ceo", "cto", 0.7),
            Edge("ceo", "dev", 0.5),
            Edge("cto", "server", 0.8),
            Edge("server", "dev", 0.6),
        ],
        layers=["People", "Technology"],
    )
    return session.session_id


# ======================================================================
# Health endpoint
# ======================================================================


class TestHealthEndpoint:
    async def test_health_endpoint(self) -> None:
        """GET /api/health should return 200 with status ok."""
        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            resp = await client.get("/api/health")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


# ======================================================================
# Analyze
# ======================================================================


class TestAnalyzeEndpoint:
    async def test_analyze_without_graph(self) -> None:
        """POST /api/analyze with a session that has no graph should return 400 GRAPH_EMPTY."""
        session = store.create()

        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            resp = await client.post(
                "/api/analyze",
                json={"session_id": session.session_id},
            )

        assert resp.status_code == 400
        data = resp.json()
        assert data["code"] == "GRAPH_EMPTY"


# ======================================================================
# Cascade
# ======================================================================


class TestCascadeEndpoint:
    async def test_cascade_without_graph(self) -> None:
        """POST /api/cascade with a session that has no graph should return 400 GRAPH_EMPTY."""
        session = store.create()

        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            resp = await client.post(
                "/api/cascade",
                json={
                    "session_id": session.session_id,
                    "event": {"target": "ceo", "action": "kill"},
                },
            )

        assert resp.status_code == 400
        data = resp.json()
        assert data["code"] == "GRAPH_EMPTY"


# ======================================================================
# Explore
# ======================================================================


class TestExploreEndpoint:
    async def test_explore_without_analysis(self) -> None:
        """POST /api/explore on a session with a graph but no prior analysis
        should return 400 ANALYSIS_NOT_RUN."""
        sid = _create_session_with_graph()

        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            resp = await client.post(
                "/api/explore",
                json={"session_id": sid},
            )

        assert resp.status_code == 400
        data = resp.json()
        assert data["code"] == "ANALYSIS_NOT_RUN"


# ======================================================================
# Get graph
# ======================================================================


class TestGetGraphEndpoint:
    async def test_get_graph_invalid_session(self) -> None:
        """GET /api/graph/invalid should return 404 SESSION_NOT_FOUND."""
        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            resp = await client.get("/api/graph/invalid")

        assert resp.status_code == 404
        data = resp.json()
        assert data["code"] == "SESSION_NOT_FOUND"


# ======================================================================
# Reset
# ======================================================================


class TestResetEndpoint:
    async def test_reset_without_graph(self) -> None:
        """POST /api/reset on a session without a graph should return 400 GRAPH_EMPTY."""
        session = store.create()

        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            resp = await client.post(
                "/api/reset",
                json={"session_id": session.session_id},
            )

        assert resp.status_code == 400
        data = resp.json()
        assert data["code"] == "GRAPH_EMPTY"


# ======================================================================
# Graph update
# ======================================================================


class TestGraphUpdateEndpoint:
    async def test_graph_update_add_node(self) -> None:
        """POST /api/graph/update with add_node should add the node to the graph."""
        sid = _create_session_with_graph()

        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            resp = await client.post(
                "/api/graph/update",
                json={
                    "session_id": sid,
                    "operations": [
                        {
                            "op": "add_node",
                            "node": {
                                "id": "intern",
                                "name": "Intern",
                                "layer": "People",
                                "h": 1.0,
                                "theta": 0.1,
                                "r": 5.0,
                            },
                        },
                    ],
                },
            )

        assert resp.status_code == 200
        data = resp.json()
        graph_data = data["graph"]
        node_ids = [n["id"] for n in graph_data["nodes"]]
        assert "intern" in node_ids


class TestUploadJobsEndpoint:
    async def test_upload_job_returns_immediately(self, monkeypatch: pytest.MonkeyPatch) -> None:
        created = {"called": False}

        def fake_create_task(coro):
            created["called"] = True
            coro.close()
            return SimpleNamespace()

        monkeypatch.setattr("nexus_api.main.asyncio.create_task", fake_create_task)

        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            response = await client.post(
                "/api/upload-jobs",
                files={"files": ("notes.txt", b"hello world", "text/plain")},
                data={"description": "demo"},
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "queued"
        assert payload["session_id"]
        assert payload["job_id"]
        assert created["called"] is True

    async def test_run_upload_job_updates_status_and_session(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path,
    ) -> None:
        monkeypatch.setenv("HALKANTIR_DATA_DIR", str(tmp_path))
        session = store.create()
        session.graph = Graph(nodes=[], edges=[], layers=[])
        job = upload_jobs.create(session.session_id)

        graph = Graph(
            nodes=[Node("ceo", "CEO", "People", theta=0.9, r=180)],
            edges=[],
            layers=["People"],
        )
        result = SimpleNamespace(
            graph=graph,
            r_unit="days",
            confidence=0.9,
            gaps=[],
            follow_up_questions=[],
            files_parsed=[{"filename": "notes.txt", "type": "txt", "chars_extracted": 11}],
            standard=SimpleNamespace(company="Acme", known_risks=[]),
            to_dict=lambda: {
                "graph": graph.to_dict(),
                "r_unit": "days",
                "confidence": 0.9,
                "gaps": [],
                "follow_up_questions": [],
                "files_parsed": [
                    {"filename": "notes.txt", "type": "txt", "chars_extracted": 11}
                ],
            },
        )

        async def fake_ingest(files, description, progress_callback=None):
            assert files == [("notes.txt", b"hello world")]
            assert description == "demo"
            if progress_callback is not None:
                await progress_callback(
                    {
                        "type": "preview",
                        "status": "merging",
                        "progress": 0.5,
                        "stage_message": "Merging graph",
                        "graph": graph.to_dict(),
                        "new_nodes": [graph.nodes[0].to_dict()],
                        "new_edges": [],
                        "metrics": {
                            "files_total": 1,
                            "files_processed": 1,
                            "candidate_nodes": 1,
                            "candidate_edges": 0,
                        },
                    }
                )
            return result

        monkeypatch.setattr("nexus_api.ingestion.extractor.ingest", fake_ingest)
        monkeypatch.setattr(
            "nexus_api.ingestion.standard.save_standard",
            lambda session_id, standard: tmp_path / f"{session_id}.json",
        )

        await _run_upload_job(job.job_id, session.session_id, [("notes.txt", b"hello world")], "demo")

        saved_job = upload_jobs.require(job.job_id)
        assert saved_job.status == "completed"
        assert saved_job.result is not None
        assert saved_job.graph_preview["nodes"][0]["id"] == "ceo"
        assert store.require(session.session_id).graph is not None

    def test_upload_ws_streams_snapshot_and_completion(self) -> None:
        session = store.create()
        session.graph = Graph(nodes=[], edges=[], layers=[])
        job = upload_jobs.create(session.session_id)
        upload_jobs.update(
            job.job_id,
            status="completed",
            progress=1.0,
            stage_message="Graph ready",
            graph_preview={"layers": ["People"], "nodes": [], "edges": []},
            result={
                "session_id": session.session_id,
                "files_parsed": [],
                "graph": {"layers": ["People"], "nodes": [], "edges": []},
                "r_unit": "days",
                "confidence": 1.0,
                "gaps": [],
                "follow_up_questions": [],
            },
        )

        with TestClient(app) as client:
            with client.websocket_connect(f"/ws/upload/{job.job_id}") as websocket:
                websocket.send_json({"action": "subscribe"})
                status = websocket.receive_json()
                snapshot = websocket.receive_json()
                complete = websocket.receive_json()

        assert status["type"] == "job_status"
        assert snapshot["type"] == "graph_snapshot"
        assert complete["type"] == "job_complete"


class TestGoogleDriveImportEndpoint:
    async def test_google_drive_import_invalid_folder_id(self) -> None:
        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            resp = await client.post(
                "/api/google-drive/import",
                json={
                    "access_token": "token",
                    "folder_id": "not a valid folder identifier",
                    "description": "",
                },
            )

        assert resp.status_code == 400
        data = resp.json()
        assert data["code"] == "GOOGLE_DRIVE_ERROR"


# ======================================================================
# Full pipeline integration
# ======================================================================


class TestFullPipeline:
    @pytest.mark.slow
    async def test_full_pipeline_integration(self) -> None:
        """Create a session with a graph, run analyze, then explore.

        This exercises the full pipeline end-to-end through the API layer.
        """
        sid = _create_session_with_graph()

        async with AsyncClient(
            transport=_transport(),
            base_url=_base_url(),
            timeout=60.0,
        ) as client:
            # Step 1: analyze
            analyze_resp = await client.post(
                "/api/analyze",
                json={"session_id": sid},
            )
            assert analyze_resp.status_code == 200
            analyze_data = analyze_resp.json()
            assert "vulnerability_report" in analyze_data
            assert "computation_time_ms" in analyze_data

            # Step 2: explore (with tight limits for speed)
            explore_resp = await client.post(
                "/api/explore",
                json={
                    "session_id": sid,
                    "config": {
                        "max_depth": 3,
                        "max_tree_nodes": 100,
                        "worst_k": 5,
                    },
                },
            )
            assert explore_resp.status_code == 200
            explore_data = explore_resp.json()

            # Verify the response structure.
            assert "tree_stats" in explore_data
            assert "worst_scenarios" in explore_data
            assert "recommendations" in explore_data
            assert "visualization_data" in explore_data

            tree_stats = explore_data["tree_stats"]
            assert tree_stats["total_nodes_explored"] > 0
            assert tree_stats["max_depth_reached"] >= 0

            # At least one scenario should have been found.
            scenarios = explore_data["worst_scenarios"]
            assert len(scenarios) >= 1

            # Each scenario should have the expected fields.
            sc = scenarios[0]
            assert "rank" in sc
            assert "severity" in sc
            assert "health_remaining" in sc
            assert "path" in sc
