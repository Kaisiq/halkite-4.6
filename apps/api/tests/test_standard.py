"""Tests for the data standardization layer."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from nexus_api.ingestion.standard import (
    StandardFormat,
    build_graph_from_standard,
    detect_standard_format,
    load_standard,
    normalize_ai_output,
    save_standard,
)


# ======================================================================
# Fixtures
# ======================================================================

@pytest.fixture
def test_json_path() -> Path:
    """Path to the test.json fixture in the docs directory."""
    return Path(__file__).resolve().parents[3] / "docs" / "test.json"


@pytest.fixture
def test_json_bytes(test_json_path: Path) -> bytes:
    return test_json_path.read_bytes()


@pytest.fixture
def minimal_standard_dict() -> dict:
    """Minimal valid standard format dict."""
    return {
        "company": "Test Corp",
        "r_unit": "days",
        "layers": ["People", "Tech"],
        "nodes": [
            {"id": "a", "name": "Alice", "layer": "People", "h": 1.0, "theta": 0.8, "r": 30},
            {"id": "b", "name": "Server", "layer": "Tech", "h": 1.0, "theta": 0.6, "r": 5},
        ],
        "edges": [
            {"from": "a", "to": "b", "weight": 0.5, "meta": "Alice manages the server"},
        ],
        "known_risks": ["Single server"],
    }


@pytest.fixture
def tmp_data_dir(tmp_path: Path):
    """Patch NEXUS_DATA_DIR to a temp directory."""
    with patch.dict("os.environ", {"NEXUS_DATA_DIR": str(tmp_path)}):
        yield tmp_path


# ======================================================================
# Detection
# ======================================================================

class TestDetectStandardFormat:
    def test_valid_test_json(self, test_json_bytes: bytes):
        """docs/test.json should be detected as standard format."""
        result = detect_standard_format(test_json_bytes)
        assert result is not None
        assert isinstance(result, StandardFormat)
        assert len(result.nodes) > 0
        assert len(result.edges) > 0
        assert len(result.layers) > 0

    def test_valid_minimal(self, minimal_standard_dict: dict):
        raw = json.dumps(minimal_standard_dict).encode()
        result = detect_standard_format(raw)
        assert result is not None
        assert result.company == "Test Corp"
        assert len(result.nodes) == 2
        assert len(result.edges) == 1

    def test_csv_returns_none(self):
        csv_bytes = b"Name,Role,Department\nAlice,CEO,Exec\nBob,CTO,Tech"
        assert detect_standard_format(csv_bytes) is None

    def test_non_json_returns_none(self):
        assert detect_standard_format(b"Hello world") is None
        assert detect_standard_format(b"\x00\x01\x02") is None

    def test_json_without_theta_returns_none(self):
        """JSON with nodes but no theta is not standard format."""
        data = {
            "layers": ["People"],
            "nodes": [{"id": "a", "name": "Alice", "layer": "People"}],
            "edges": [{"from": "a", "to": "a", "weight": 0.5}],
        }
        assert detect_standard_format(json.dumps(data).encode()) is None

    def test_json_missing_edges_returns_none(self):
        data = {
            "layers": ["People"],
            "nodes": [{"id": "a", "name": "Alice", "layer": "People", "theta": 0.5}],
        }
        assert detect_standard_format(json.dumps(data).encode()) is None

    def test_empty_nodes_returns_none(self):
        data = {"layers": ["People"], "nodes": [], "edges": []}
        assert detect_standard_format(json.dumps(data).encode()) is None

    def test_json_array_returns_none(self):
        assert detect_standard_format(b"[1, 2, 3]") is None


# ======================================================================
# Normalization
# ======================================================================

class TestNormalizeAiOutput:
    def test_basic_normalization(self):
        ai_dict = {
            "layers": ["People"],
            "nodes": [
                {"id": "a", "name": "Alice", "layer": "People", "theta": 0.5, "r": 10},
            ],
            "edges": [
                {"from": "a", "to": "a", "weight": 0.3},
            ],
            "r_unit": "hours",
            "confidence": 0.8,
        }
        result = normalize_ai_output(ai_dict, company="Test Co")
        assert isinstance(result, StandardFormat)
        assert result.company == "Test Co"
        assert result.r_unit == "hours"
        assert len(result.nodes) == 1
        assert result.nodes[0].theta == 0.5

    def test_ai_output_with_company_field(self):
        """If AI output already includes company, use it."""
        ai_dict = {
            "company": "AI Detected Corp",
            "layers": ["Tech"],
            "nodes": [{"id": "s", "name": "Server", "layer": "Tech", "theta": 0.9, "r": 1}],
            "edges": [{"from": "s", "to": "s", "weight": 0.1}],
        }
        result = normalize_ai_output(ai_dict, company="User Description")
        assert result.company == "AI Detected Corp"

    def test_defaults(self):
        ai_dict = {
            "layers": ["People"],
            "nodes": [{"id": "a", "name": "A", "layer": "People", "theta": 0.1, "r": 0}],
            "edges": [{"from": "a", "to": "a", "weight": 0.1}],
        }
        result = normalize_ai_output(ai_dict)
        assert result.company == ""
        assert result.r_unit == "days"
        assert result.known_risks == []


# ======================================================================
# Persistence
# ======================================================================

class TestPersistence:
    def test_save_and_load_roundtrip(self, minimal_standard_dict: dict, tmp_data_dir: Path):
        standard = StandardFormat.model_validate(minimal_standard_dict)
        session_id = "test-session-123"

        path = save_standard(session_id, standard)
        assert path.exists()
        assert path.name == "standard.json"

        loaded = load_standard(session_id)
        assert loaded.company == standard.company
        assert loaded.r_unit == standard.r_unit
        assert len(loaded.nodes) == len(standard.nodes)
        assert len(loaded.edges) == len(standard.edges)
        assert loaded.known_risks == standard.known_risks

    def test_load_nonexistent_raises(self, tmp_data_dir: Path):
        with pytest.raises(FileNotFoundError, match="No standard.json found"):
            load_standard("nonexistent-session")

    def test_saved_json_uses_from_alias(self, minimal_standard_dict: dict, tmp_data_dir: Path):
        """Saved JSON should use 'from'/'to' not 'from_id'/'to_id'."""
        standard = StandardFormat.model_validate(minimal_standard_dict)
        path = save_standard("alias-test", standard)

        saved = json.loads(path.read_text())
        edge = saved["edges"][0]
        assert "from" in edge
        assert "to" in edge
        assert "from_id" not in edge
        assert "to_id" not in edge


# ======================================================================
# Graph construction
# ======================================================================

class TestBuildGraphFromStandard:
    def test_basic_construction(self, minimal_standard_dict: dict):
        standard = StandardFormat.model_validate(minimal_standard_dict)
        graph, r_unit = build_graph_from_standard(standard)

        assert r_unit == "days"
        assert len(graph.nodes) == 2
        assert len(graph.edges) == 1
        assert graph.nodes[0].id == "a"
        assert graph.nodes[1].id == "b"

    def test_edge_meta_preserved(self, minimal_standard_dict: dict):
        standard = StandardFormat.model_validate(minimal_standard_dict)
        graph, _ = build_graph_from_standard(standard)

        assert graph.edges[0].meta == "Alice manages the server"

    def test_from_test_json(self, test_json_bytes: bytes):
        """Build graph from the full docs/test.json."""
        standard = detect_standard_format(test_json_bytes)
        assert standard is not None

        graph, r_unit = build_graph_from_standard(standard)
        assert r_unit == "days"
        assert len(graph.nodes) > 40
        assert len(graph.edges) > 100
        assert len(graph.layers) == 6

    def test_full_roundtrip(self, test_json_bytes: bytes, tmp_data_dir: Path):
        """Detect -> save -> load -> build graph roundtrip."""
        standard = detect_standard_format(test_json_bytes)
        assert standard is not None

        save_standard("roundtrip-test", standard)
        loaded = load_standard("roundtrip-test")

        graph, r_unit = build_graph_from_standard(loaded)
        assert len(graph.nodes) > 40
        assert len(graph.edges) > 100

        validation = graph.validate()
        assert validation.is_valid
