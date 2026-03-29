"""Tests for achilles_api.engine.weakpoint -- all 6 algorithms + VulnerabilityReport."""

from __future__ import annotations

import math

from achilles_api.engine.weakpoint import (
    VulnerabilityReport,
    bridge_node_detection,
    cluster_detection,
    compound_vulnerability_pairs,
    critical_edge_detection,
    layer_dependency_analysis,
    node_impact_ranking,
    run_full_analysis,
)

# ======================================================================
# Algorithm 1: Node Impact Ranking
# ======================================================================


def test_node_impact_ranking_order(medium_graph):
    """CEO should be ranked first -- highest theta and most connections."""
    rankings = node_impact_ranking(medium_graph)
    assert rankings[0].node_id == "ceo"


def test_node_impact_ranking_all_nodes(medium_graph):
    """Should return exactly one entry per node in the graph."""
    rankings = node_impact_ranking(medium_graph)
    assert len(rankings) == len(medium_graph.nodes)
    returned_ids = {r.node_id for r in rankings}
    expected_ids = {n.id for n in medium_graph.nodes}
    assert returned_ids == expected_ids


# ======================================================================
# Algorithm 2: Critical Edge Detection
# ======================================================================


def test_critical_edge_detection(medium_graph):
    """Should return exactly one entry per edge."""
    edges = critical_edge_detection(medium_graph)
    assert len(edges) == len(medium_graph.edges)


def test_critical_edge_cross_layer(medium_graph):
    """Edges between different layers should have crosses_layers=True."""
    edges = critical_edge_detection(medium_graph)
    edge_map = {(e.from_node, e.to_node): e for e in edges}

    # cto (People) -> server (Technology) crosses layers
    assert edge_map[("cto", "server")].crosses_layers is True

    # ceo (People) -> cto (People) stays within the same layer
    assert edge_map[("ceo", "cto")].crosses_layers is False


# ======================================================================
# Algorithm 3: Bridge Node Detection
# ======================================================================


def test_bridge_node_detection(medium_graph):
    """Verify bridge nodes are found (or list is empty for fully connected).

    The medium_graph has supplier and office connected only through cto and dev,
    so removing certain nodes should fragment the graph.  Either way the result
    is a valid list of BridgeNode objects.
    """
    bridges = bridge_node_detection(medium_graph)
    # The result is a list; each entry is a BridgeNode with the required fields.
    for b in bridges:
        assert b.splits_into >= 2
        assert b.fragmentation_score >= 0.0
        assert b.layer in {"People", "Technology", "Supply", "Facilities"}


# ======================================================================
# Algorithm 4: Cluster Detection
# ======================================================================


def test_cluster_detection(medium_graph):
    """At least 1 cluster should be detected."""
    clusters = cluster_detection(medium_graph)
    assert len(clusters) >= 1


def test_cluster_isolation_risk(medium_graph):
    """Every cluster's isolation_risk should be a positive number (or inf)."""
    clusters = cluster_detection(medium_graph)
    for c in clusters:
        assert c.isolation_risk > 0.0
        # Could be inf for clusters with no external edges
        assert c.isolation_risk > 0 or math.isinf(c.isolation_risk)


# ======================================================================
# Algorithm 5: Compound Vulnerability Pairs
# ======================================================================


def test_compound_pairs(medium_graph):
    """Should return pairs with synergy values computed."""
    pairs = compound_vulnerability_pairs(medium_graph)
    assert len(pairs) > 0
    for p in pairs:
        assert isinstance(p.synergy, float)
        assert isinstance(p.synergy_ratio, float)
        assert p.node_a != p.node_b


def test_compound_pair_synergy_direction(medium_graph):
    """At least one pair should have positive synergy (super-additive damage)."""
    pairs = compound_vulnerability_pairs(medium_graph)
    positive_synergy = [p for p in pairs if p.synergy > 0]
    assert len(positive_synergy) > 0


# ======================================================================
# Algorithm 6: Layer Dependency Analysis
# ======================================================================


def test_layer_dependency_analysis(medium_graph):
    """All 4 layers should have entries in the analysis."""
    analysis = layer_dependency_analysis(medium_graph)
    assert set(analysis.keys()) == {"People", "Technology", "Supply", "Facilities"}


def test_layer_autonomy_range(medium_graph):
    """Autonomy for every layer should be in [0, 1]."""
    analysis = layer_dependency_analysis(medium_graph)
    for layer_name, la in analysis.items():
        assert 0.0 <= la.autonomy <= 1.0, (
            f"Layer {layer_name!r} autonomy={la.autonomy} out of [0, 1]"
        )


# ======================================================================
# run_full_analysis (combined VulnerabilityReport)
# ======================================================================


def test_run_full_analysis(medium_graph):
    """VulnerabilityReport should have all fields populated."""
    report = run_full_analysis(medium_graph)
    assert isinstance(report, VulnerabilityReport)
    assert isinstance(report.network_health, float)
    assert len(report.node_rankings) == len(medium_graph.nodes)
    assert len(report.critical_edges) == len(medium_graph.edges)
    assert isinstance(report.bridge_nodes, list)
    assert len(report.clusters) >= 1
    assert len(report.compound_pairs) > 0
    assert len(report.layer_analysis) == len(medium_graph.layers)
    assert report.summary_stats is not None


def test_run_full_analysis_summary_stats(medium_graph):
    """Summary stats should contain all expected keys."""
    report = run_full_analysis(medium_graph)
    stats = report.summary_stats
    assert stats.total_nodes == 6
    assert stats.total_edges == 7
    assert stats.total_layers == 4
    assert stats.most_critical_node is not None
    assert stats.most_fragile_layer is not None
    assert stats.highest_synergy_pair is not None
    assert isinstance(stats.bridge_count, int)
    assert isinstance(stats.cluster_count, int)
