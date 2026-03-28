"""Tests for the Halkantir FastAPI routes (Module 5).

Covers health, analyze, cascade, explore, graph, and reset endpoints
from ``nexus_api.main``.  Uses httpx AsyncClient with ASGITransport
for all requests.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from nexus_api import main as api_main
from nexus_api.main import app
from nexus_api.models.graph import Edge, Graph, Node
from nexus_api.session import store
from nexus_api.waitlist import SlidingWindowRateLimiter, WaitlistStore

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _transport() -> ASGITransport:
    return ASGITransport(app=app)


def _base_url() -> str:
    return "http://testserver"


@pytest.fixture(autouse=True)
def reset_waitlist_state(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("HALKANTIR_DATA_DIR", str(tmp_path))
    api_main.waitlist_store = WaitlistStore()
    api_main.waitlist_rate_limiter = SlidingWindowRateLimiter(limit=5, window_seconds=3600)


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


class TestWaitlistEndpoint:
    async def test_waitlist_signup_accepts_valid_email(self) -> None:
        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            resp = await client.post(
                "/api/waitlist",
                json={"email": "founder@example.com", "company": "Acme", "website": ""},
                headers={"x-forwarded-for": "203.0.113.10"},
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "created"

    async def test_waitlist_signup_rejects_invalid_email(self) -> None:
        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            resp = await client.post(
                "/api/waitlist",
                json={"email": "not-an-email", "company": "", "website": ""},
            )

        assert resp.status_code == 422

    async def test_waitlist_signup_ignores_honeypot(self) -> None:
        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            resp = await client.post(
                "/api/waitlist",
                json={
                    "email": "bot@example.com",
                    "company": "Spam Co",
                    "website": "https://bot.invalid",
                },
            )

            duplicate_resp = await client.post(
                "/api/waitlist",
                json={"email": "bot@example.com", "company": "", "website": ""},
            )

        assert resp.status_code == 200
        assert resp.json()["status"] == "accepted"
        assert duplicate_resp.status_code == 201
        assert duplicate_resp.json()["status"] == "created"

    async def test_waitlist_signup_rate_limits_by_ip(self) -> None:
        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            for index in range(5):
                resp = await client.post(
                    "/api/waitlist",
                    json={"email": f"user{index}@example.com", "company": "", "website": ""},
                    headers={"x-forwarded-for": "198.51.100.7"},
                )
                assert resp.status_code == 201

            limited_resp = await client.post(
                "/api/waitlist",
                json={"email": "overflow@example.com", "company": "", "website": ""},
                headers={"x-forwarded-for": "198.51.100.7"},
            )

        assert limited_resp.status_code == 429
        assert limited_resp.json()["code"] == "RATE_LIMITED"

    async def test_waitlist_signup_returns_existing_status_for_duplicate(self) -> None:
        async with AsyncClient(transport=_transport(), base_url=_base_url()) as client:
            first = await client.post(
                "/api/waitlist",
                json={"email": "repeat@example.com", "company": "", "website": ""},
            )
            second = await client.post(
                "/api/waitlist",
                json={"email": "REPEAT@example.com", "company": "", "website": ""},
            )

        assert first.status_code == 201
        assert second.status_code == 200
        assert second.json()["status"] == "already_registered"


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
