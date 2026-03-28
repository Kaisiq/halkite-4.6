"""Tests for the Halkantir graph model (Module 1A).

Covers Node, Edge, Graph, State, and ValidationResult from
``nexus_api.models.graph``.
"""

from __future__ import annotations

import pytest

from nexus_api.ingestion.scoring import build_default_scoring_policy
from nexus_api.models.graph import Edge, Graph, Node

# ======================================================================
# Node
# ======================================================================


class TestNode:
    def test_node_creation(self):
        """Default h should be 1.0 and phi should be False."""
        node = Node("n1", "Node One", "People", theta=0.5, r=10.0)
        assert node.id == "n1"
        assert node.name == "Node One"
        assert node.layer == "People"
        assert node.h == 1.0
        assert node.phi is False
        assert node.theta == 0.5
        assert node.r == 10.0
        assert node.meta == {}

    def test_node_from_dict(self):
        """Deserialisation should populate all fields correctly."""
        data = {
            "id": "srv",
            "name": "Server",
            "layer": "Technology",
            "h": 0.8,
            "theta": 0.6,
            "r": 5.0,
            "meta": {"rack": "A3"},
        }
        node = Node.from_dict(data)
        assert node.id == "srv"
        assert node.name == "Server"
        assert node.layer == "Technology"
        assert node.h == 0.8
        assert node.theta == 0.6
        assert node.r == 5.0
        assert node.meta == {"rack": "A3"}

    def test_node_from_dict_missing_layer(self):
        """KeyError should be raised when 'layer' is absent."""
        with pytest.raises(KeyError, match="layer"):
            Node.from_dict({"id": "x", "name": "X"})


# ======================================================================
# Edge
# ======================================================================


class TestEdge:
    def test_edge_creation(self):
        """Verify from_id, to_id, and weight are stored correctly."""
        edge = Edge("a", "b", 0.75)
        assert edge.from_id == "a"
        assert edge.to_id == "b"
        assert edge.weight == 0.75

    def test_edge_default_weight(self):
        """Default weight should be 1.0."""
        edge = Edge("a", "b")
        assert edge.weight == 1.0


# ======================================================================
# Graph initialisation
# ======================================================================


class TestGraphInit:
    def test_graph_initialization(self, small_graph: Graph):
        """Adjacency matrix shape should be (n, n), with correct counts."""
        n = len(small_graph.nodes)
        assert n == 4
        assert small_graph.A.shape == (4, 4)
        assert len(small_graph.edges) == 4
        assert len(small_graph.layers) == 2


# ======================================================================
# Health computations
# ======================================================================


class TestNetworkHealth:
    def test_network_health_pristine(self, small_graph: Graph):
        """All healthy nodes should give H = 1.0."""
        assert small_graph.network_health() == pytest.approx(1.0)

    def test_network_health_after_damage(self, small_graph: Graph):
        """Setting one node h=0 should lower H below 1.0."""
        ceo = small_graph.get_node("ceo")
        ceo.h = 0.0
        ceo.phi = True
        H = small_graph.network_health()
        assert H < 1.0

    def test_layer_health(self, small_graph: Graph):
        """Per-layer health should be 1.0 when all nodes are pristine."""
        assert small_graph.layer_health("People") == pytest.approx(1.0)
        assert small_graph.layer_health("Technology") == pytest.approx(1.0)

    def test_layer_health_after_damage(self, small_graph: Graph):
        """Damaging a People node should lower People layer health only."""
        ceo = small_graph.get_node("ceo")
        ceo.h = 0.0
        ceo.phi = True
        assert small_graph.layer_health("People") < 1.0
        assert small_graph.layer_health("Technology") == pytest.approx(1.0)


# ======================================================================
# Snapshot / State
# ======================================================================


class TestSnapshot:
    def test_snapshot(self, small_graph: Graph):
        """State should capture h, phi, H, and H_per_layer correctly."""
        state = small_graph.snapshot()
        assert len(state.h) == 4
        assert len(state.phi) == 4
        assert all(h == pytest.approx(1.0) for h in state.h)
        assert not any(state.phi)
        assert pytest.approx(1.0) == state.H
        assert "People" in state.H_per_layer
        assert "Technology" in state.H_per_layer

    def test_state_equality(self, small_graph: Graph):
        """Two snapshots of the same pristine graph should be equal."""
        s1 = small_graph.snapshot()
        s2 = small_graph.snapshot()
        assert s1 == s2

    def test_state_inequality_after_mutation(self, small_graph: Graph):
        """A state taken after mutation should differ from the pristine one."""
        s1 = small_graph.snapshot()
        small_graph.get_node("ceo").h = 0.0
        s2 = small_graph.snapshot()
        assert s1 != s2


# ======================================================================
# Deep copy / reset
# ======================================================================


class TestDeepCopyAndReset:
    def test_deep_copy(self, small_graph: Graph):
        """Mutating the copy should not affect the original."""
        clone = small_graph.deep_copy()
        clone.get_node("ceo").h = 0.0
        clone.get_node("ceo").phi = True
        assert small_graph.get_node("ceo").h == 1.0
        assert small_graph.get_node("ceo").phi is False

    def test_reset(self, small_graph: Graph):
        """After reset, all nodes should have h=1.0 and phi=False."""
        ceo = small_graph.get_node("ceo")
        ceo.h = 0.0
        ceo.phi = True
        small_graph.reset()
        for node in small_graph.nodes:
            assert node.h == 1.0
            assert node.phi is False


# ======================================================================
# Node / edge accessors
# ======================================================================


class TestAccessors:
    def test_get_node(self, small_graph: Graph):
        """get_node should return the correct node."""
        node = small_graph.get_node("cto")
        assert node.id == "cto"
        assert node.name == "CTO"

    def test_get_node_missing(self, small_graph: Graph):
        """get_node should raise KeyError for unknown ids."""
        with pytest.raises(KeyError):
            small_graph.get_node("nonexistent")

    def test_remove_edge(self, small_graph: Graph):
        """Removing an edge should update the edge list and adjacency matrix."""
        assert len(small_graph.edges) == 4
        i_cto = small_graph.get_node_index("cto")
        j_ceo = small_graph.get_node_index("ceo")
        assert small_graph.A[i_cto, j_ceo] == pytest.approx(0.7)

        small_graph.remove_edge("ceo", "cto")

        assert len(small_graph.edges) == 3
        assert small_graph.A[i_cto, j_ceo] == pytest.approx(0.0)

    def test_remove_edge_nonexistent(self, small_graph: Graph):
        """Removing a non-existent edge should raise ValueError."""
        with pytest.raises(ValueError):
            small_graph.remove_edge("dev", "ceo")


# ======================================================================
# Validation
# ======================================================================


class TestValidation:
    def test_validate_valid_graph(self, small_graph: Graph):
        """The small_graph fixture should be fully valid."""
        result = small_graph.validate()
        assert result.is_valid
        assert len(result.errors) == 0

    def test_validate_self_loop(self, small_graph: Graph):
        """Adding a self-loop edge should produce a validation error."""
        small_graph.edges.append(Edge("ceo", "ceo", 0.5))
        small_graph.rebuild()
        result = small_graph.validate()
        assert not result.is_valid
        assert any("Self-loop" in e for e in result.errors)

    def test_validate_empty_graph(self):
        """A graph with no nodes should fail validation."""
        g = Graph(nodes=[], edges=[], layers=[])
        result = g.validate()
        assert not result.is_valid
        assert any("at least 2 nodes" in e for e in result.errors)

    def test_validate_evidence_backed_graph(self):
        g = Graph(
            nodes=[
                Node(
                    "ceo",
                    "CEO",
                    "People",
                    theta=0.8,
                    r=10,
                    meta={
                        "type": "person",
                        "function": "leadership",
                        "evidence": [{"kind": "document", "source": "org.pdf", "confidence": 0.9}],
                    },
                ),
                Node(
                    "erp",
                    "ERP",
                    "Technology",
                    theta=0.4,
                    r=3,
                    meta={
                        "type": "service",
                        "function": "planning",
                        "evidence": [
                            {
                                "kind": "diagram",
                                "source": "arch.drawio",
                                "confidence": 0.8,
                            }
                        ],
                    },
                ),
            ],
            edges=[
                Edge(
                    "ceo",
                    "erp",
                    0.5,
                    meta={
                        "dependency_type": "operational",
                        "evidence": [
                            {
                                "kind": "document",
                                "source": "runbook.md",
                                "confidence": 0.8,
                            }
                        ],
                    },
                )
            ],
            layers=["People", "Technology"],
            scoring_policy=build_default_scoring_policy(),
        )
        result = g.validate()
        assert result.is_valid

    def test_validate_evidence_backed_graph_missing_type(self):
        g = Graph(
            nodes=[
                Node("ceo", "CEO", "People", theta=0.8, r=10, meta={"evidence": []}),
                Node(
                    "erp",
                    "ERP",
                    "Technology",
                    theta=0.4,
                    r=3,
                    meta={
                        "type": "service",
                        "function": "planning",
                        "evidence": [
                            {
                                "kind": "diagram",
                                "source": "arch.drawio",
                                "confidence": 0.8,
                            }
                        ],
                    },
                ),
            ],
            edges=[
                Edge(
                    "ceo",
                    "erp",
                    0.5,
                    meta={
                        "dependency_type": "operational",
                        "evidence": [
                            {
                                "kind": "document",
                                "source": "runbook.md",
                                "confidence": 0.8,
                            }
                        ],
                    },
                )
            ],
            layers=["People", "Technology"],
            scoring_policy=build_default_scoring_policy(),
        )
        result = g.validate()
        assert not result.is_valid
        assert any("meta.type" in e for e in result.errors)


# ======================================================================
# Rebuild
# ======================================================================


class TestRebuild:
    def test_rebuild(self, small_graph: Graph):
        """After adding a node and rebuilding, adjacency matrix should grow."""
        old_shape = small_graph.A.shape
        small_graph.nodes.append(Node("new_node", "New", "People", theta=0.1))
        small_graph.rebuild()
        assert small_graph.A.shape == (old_shape[0] + 1, old_shape[1] + 1)
        assert "new_node" in small_graph.node_index
