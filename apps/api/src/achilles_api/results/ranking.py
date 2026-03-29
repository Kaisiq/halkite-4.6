"""Module 4A -- Results & Ranking.

Take the explored state tree and produce the final output: ranked worst-case
scenarios with AI-generated narratives, actionable recommendations, and data
for visualization.

Public API
----------
extract_scenarios(tree, graph, top_k)       -- ranked worst-case scenarios.
generate_recommendations(scenarios, vr, g)  -- actionable recommendations.
precompute_animation(scenario, graph)       -- frame-by-frame cascade replay.
build_final_report(graph, tree, vr)         -- everything in one report.
generate_narrative(scenario, graph)         -- AI narrative for one scenario.
generate_all_narratives(scenarios, graph)   -- AI narratives for all.

References: docs/04A_RESULTS_RANKING.md
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from typing import Any

from achilles_api.engine.state_tree import (
    StateTree,
    TreeNode,
    extract_path,
    tree_stats,
)
from achilles_api.engine.weakpoint import VulnerabilityReport
from achilles_api.models.graph import Graph

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


class Scenario:
    """A single ranked worst-case failure scenario extracted from the tree."""

    __slots__ = (
        "agent",
        "animation_frames",
        "cross_layer_events",
        "depth",
        "failed_fraction",
        "failed_nodes",
        "health_lost",
        "health_remaining",
        "intended_outcome",
        "layers_affected",
        "narrative",
        "path",
        "rank",
        "recommendations",
        "recovery_cost",
        "severity",
        "severity_label",
        "summary",
        "title",
    )

    def __init__(
        self,
        *,
        rank: int = 0,
        severity: float = 0.0,
        severity_label: str = "",
        title: str = "",
        summary: str = "",
        health_remaining: float = 1.0,
        health_lost: float = 0.0,
        intended_outcome: str = "",
        failed_nodes: list[str] | None = None,
        failed_fraction: float = 0.0,
        recovery_cost: float = 0.0,
        depth: int = 0,
        agent: str = "",
        path: list[dict[str, Any]] | None = None,
        layers_affected: list[str] | None = None,
        cross_layer_events: int = 0,
        narrative: dict[str, Any] | None = None,
        recommendations: list[dict[str, Any]] | None = None,
        animation_frames: list[AnimationFrame] | None = None,
    ) -> None:
        self.rank: int = rank
        self.severity: float = severity
        self.severity_label: str = severity_label
        self.title: str = title
        self.summary: str = summary
        self.health_remaining: float = health_remaining
        self.health_lost: float = health_lost
        self.intended_outcome: str = intended_outcome
        self.failed_nodes: list[str] = failed_nodes if failed_nodes is not None else []
        self.failed_fraction: float = failed_fraction
        self.recovery_cost: float = recovery_cost
        self.depth: int = depth
        self.agent: str = agent
        self.path: list[dict[str, Any]] = path if path is not None else []
        self.layers_affected: list[str] = layers_affected if layers_affected is not None else []
        self.cross_layer_events: int = cross_layer_events
        self.narrative: dict[str, Any] | None = narrative
        self.recommendations: list[dict[str, Any]] | None = recommendations
        self.animation_frames: list[AnimationFrame] | None = animation_frames

    def __repr__(self) -> str:
        return (
            f"Scenario(rank={self.rank}, severity={self.severity:.3f}, "
            f"H={self.health_remaining:.4f}, agent={self.agent!r})"
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "rank": self.rank,
            "severity": self.severity,
            "severity_label": self.severity_label,
            "title": self.title,
            "summary": self.summary,
            "health_remaining": self.health_remaining,
            "health_lost": self.health_lost,
            "intended_outcome": self.intended_outcome,
            "failed_nodes": self.failed_nodes,
            "failed_fraction": self.failed_fraction,
            "recovery_cost": self.recovery_cost,
            "depth": self.depth,
            "agent": self.agent,
            "path": [
                {k: (v.to_dict() if hasattr(v, "to_dict") else v) for k, v in step.items()}
                for step in self.path
            ],
            "layers_affected": self.layers_affected,
            "cross_layer_events": self.cross_layer_events,
            "narrative": self.narrative,
            "recommendations": self.recommendations,
            "animation_frames": (
                [f.to_dict() for f in self.animation_frames]
                if self.animation_frames is not None
                else None
            ),
        }


class Recommendation:
    """An actionable recommendation derived from scenario analysis."""

    __slots__ = (
        "action",
        "estimated_resilience_gain",
        "priority",
        "reason",
        "scenarios_prevented",
        "target",
        "type",
    )

    def __init__(
        self,
        *,
        priority: int = 0,
        type: str = "",
        target: str = "",
        action: str = "",
        reason: str = "",
        estimated_resilience_gain: str = "",
        scenarios_prevented: int = 0,
    ) -> None:
        self.priority: int = priority
        self.type: str = type
        self.target: str = target
        self.action: str = action
        self.reason: str = reason
        self.estimated_resilience_gain: str = estimated_resilience_gain
        self.scenarios_prevented: int = scenarios_prevented

    def __repr__(self) -> str:
        return (
            f"Recommendation(priority={self.priority}, type={self.type!r}, target={self.target!r})"
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "priority": self.priority,
            "type": self.type,
            "target": self.target,
            "action": self.action,
            "reason": self.reason,
            "estimated_resilience_gain": self.estimated_resilience_gain,
            "scenarios_prevented": self.scenarios_prevented,
        }


class AnimationFrame:
    """A single frame for frontend cascade animation playback."""

    __slots__ = ("H", "event", "node_failed", "node_healths", "step")

    def __init__(
        self,
        *,
        step: int,
        node_healths: dict[str, float],
        node_failed: dict[str, bool],
        event: dict[str, Any] | None = None,
        H: float = 1.0,
    ) -> None:
        self.step: int = step
        self.node_healths: dict[str, float] = node_healths
        self.node_failed: dict[str, bool] = node_failed
        self.event: dict[str, Any] | None = event
        self.H: float = H

    def __repr__(self) -> str:
        return f"AnimationFrame(step={self.step}, H={self.H:.4f})"

    def to_dict(self) -> dict[str, Any]:
        return {
            "step": self.step,
            "node_healths": self.node_healths,
            "node_failed": self.node_failed,
            "event": self.event,
            "H": self.H,
        }


class FinalReport:
    """Complete analysis output combining all modules."""

    __slots__ = (
        "metadata",
        "network_health",
        "recommendations",
        "resilience_profile",
        "visualization_data",
        "vulnerability_summary",
        "worst_scenarios",
    )

    def __init__(
        self,
        *,
        metadata: dict[str, Any] | None = None,
        network_health: dict[str, Any] | None = None,
        vulnerability_summary: dict[str, Any] | None = None,
        worst_scenarios: list[Scenario] | None = None,
        recommendations: list[Recommendation] | None = None,
        visualization_data: dict[str, Any] | None = None,
        resilience_profile: dict[str, Any] | None = None,
    ) -> None:
        self.metadata: dict[str, Any] = metadata if metadata is not None else {}
        self.network_health: dict[str, Any] = network_health if network_health is not None else {}
        self.vulnerability_summary: dict[str, Any] = (
            vulnerability_summary if vulnerability_summary is not None else {}
        )
        self.worst_scenarios: list[Scenario] = (
            worst_scenarios if worst_scenarios is not None else []
        )
        self.recommendations: list[Recommendation] = (
            recommendations if recommendations is not None else []
        )
        self.visualization_data: dict[str, Any] = (
            visualization_data if visualization_data is not None else {}
        )
        self.resilience_profile: dict[str, Any] | None = resilience_profile

    def __repr__(self) -> str:
        return (
            f"FinalReport(scenarios={len(self.worst_scenarios)}, "
            f"recommendations={len(self.recommendations)})"
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "metadata": self.metadata,
            "network_health": self.network_health,
            "vulnerability_summary": self.vulnerability_summary,
            "worst_scenarios": [s.to_dict() for s in self.worst_scenarios],
            "recommendations": [r.to_dict() for r in self.recommendations],
            "visualization_data": self.visualization_data,
            "resilience_profile": self.resilience_profile,
        }


# ---------------------------------------------------------------------------
# Step 1: Scenario extraction
# ---------------------------------------------------------------------------


def _severity_label(severity: float) -> str:
    """Map a composite severity score to a human-readable label."""
    if severity >= 0.75:
        return "Critical"
    if severity >= 0.50:
        return "High"
    if severity >= 0.25:
        return "Medium"
    return "Low"


def _failed_node_ids(state_phi: list[bool], graph: Graph) -> list[str]:
    """Return a list of node ids for all nodes marked as failed in *state_phi*."""
    return [graph.nodes[i].id for i, phi in enumerate(state_phi) if phi]


def _layers_affected(state_phi: list[bool], graph: Graph) -> list[str]:
    """Return the unique layer names of all failed nodes."""
    seen: list[str] = []
    for i, phi in enumerate(state_phi):
        if phi:
            layer = graph.nodes[i].layer
            if layer not in seen:
                seen.append(layer)
    return seen


def _count_cross_layer_events(path: list[dict[str, Any]], graph: Graph) -> int:
    """Count path steps where failures crossed layer boundaries."""
    count = 0
    for step in path:
        new_failures: list[str] = step.get("new_failures", [])
        if not new_failures:
            continue
        event = step.get("event")
        if event is None:
            continue
        # Determine the layer of the event target.
        target_ids = event.target_node_ids() if hasattr(event, "target_node_ids") else []
        if not target_ids:
            continue
        target_layers: set[str] = set()
        for tid in target_ids:
            try:
                target_layers.add(graph.get_node(tid).layer)
            except KeyError:
                pass
        # Check if any newly failed node is in a different layer.
        for fid_str in new_failures:
            # new_failures may be indices (strings of ints) from extract_path.
            try:
                fid_int = int(fid_str)
                failed_layer = graph.nodes[fid_int].layer
            except ValueError, IndexError:
                try:
                    failed_layer = graph.get_node(fid_str).layer
                except KeyError:
                    continue
            if failed_layer not in target_layers:
                count += 1
                break  # Count the step once.
    return count


def extract_scenarios(
    tree: StateTree,
    graph: Graph,
    top_k: int = 10,
) -> list[Scenario]:
    """Extract, score, deduplicate, and rank the worst-case scenarios.

    Parameters
    ----------
    tree : StateTree
        The fully explored state tree.
    graph : Graph
        The original network graph (for node metadata and layer info).
    top_k : int
        Number of top scenarios to return.

    Returns
    -------
    list[Scenario]
        Scenarios sorted by composite severity descending.
    """
    total_nodes: int = len(graph.nodes)
    total_layers: int = max(len(graph.layers), 1)

    # Maximum possible recovery cost: sum of all r values.
    max_possible_recovery: float = sum(n.r for n in graph.nodes)
    if max_possible_recovery <= 0.0:
        max_possible_recovery = 1.0  # Avoid division by zero.

    leaves: list[TreeNode] = [n for n in tree.all_nodes if not n.children]

    scored: list[Scenario] = []

    for leaf in leaves:
        path = extract_path(leaf, node_ids=tree.node_ids)
        failed = _failed_node_ids(leaf.state.phi, graph)
        failed_fraction = len(failed) / total_nodes if total_nodes > 0 else 0.0
        health_lost = 1.0 - leaf.H
        layers = _layers_affected(leaf.state.phi, graph)
        layers_affected_count = len(layers)
        cross_layer = _count_cross_layer_events(path, graph)

        # Composite severity score (spec formula).
        severity = (
            0.5 * health_lost
            + 0.2 * failed_fraction
            + 0.15 * (layers_affected_count / total_layers)
            + 0.15 * min(1.0, leaf.recovery_cost / max_possible_recovery)
        )

        scenario = Scenario(
            severity=severity,
            severity_label=_severity_label(severity),
            title=leaf.scenario_title,
            summary=leaf.scenario_summary,
            health_remaining=leaf.H,
            health_lost=health_lost,
            intended_outcome=leaf.expected_outcome,
            failed_nodes=failed,
            failed_fraction=failed_fraction,
            recovery_cost=leaf.recovery_cost,
            depth=leaf.depth,
            agent=leaf.agent,
            path=path,
            layers_affected=layers,
            cross_layer_events=cross_layer,
        )
        scored.append(scenario)

    # -- Deduplicate: same set of failed nodes = duplicate -----------------
    seen_failure_sets: dict[frozenset[str], int] = {}
    unique: list[Scenario] = []

    for sc in scored:
        key = frozenset(sc.failed_nodes)
        if key not in seen_failure_sets:
            seen_failure_sets[key] = len(unique)
            unique.append(sc)
        else:
            # Keep the scenario with the shorter path (more realistic).
            existing_idx = seen_failure_sets[key]
            if sc.depth < unique[existing_idx].depth:
                unique[existing_idx] = sc

    # -- Sort by severity descending and assign ranks ----------------------
    unique.sort(key=lambda s: s.severity, reverse=True)
    result = unique[:top_k]
    for i, sc in enumerate(result, start=1):
        sc.rank = i

    return result


# ---------------------------------------------------------------------------
# Step 2: Recommendations
# ---------------------------------------------------------------------------


def _is_bridge_node(node_id: str, vulnerability_report: VulnerabilityReport) -> bool:
    """Check whether *node_id* appears in the vulnerability report's bridge nodes."""
    for bridge in vulnerability_report.bridge_nodes:
        # BridgeNode dataclass uses ``node_id``; fall back to dict access.
        bridge_id = getattr(bridge, "node_id", None) or (
            bridge.get("node") if isinstance(bridge, dict) else None
        )
        if bridge_id == node_id:
            return True
    return False


def _has_no_redundancy(node_id: str, graph: Graph) -> bool:
    """Heuristic: a node has no redundancy if no other node in the same layer
    shares an incoming edge source with it.

    For the hackathon this is a simple approximation.
    """
    try:
        node = graph.get_node(node_id)
    except KeyError:
        return False

    # Collect nodes that *this* node depends on (incoming edges).
    incoming_sources: set[str] = set()
    for edge in graph.edges:
        if edge.to_id == node_id:
            incoming_sources.add(edge.from_id)

    if not incoming_sources:
        return True  # No dependencies = no backup providers.

    # Check if any sibling in the same layer shares at least one source.
    for other in graph.nodes:
        if other.id == node_id or other.layer != node.layer:
            continue
        for edge in graph.edges:
            if edge.to_id == other.id and edge.from_id in incoming_sources:
                return False  # Found a redundant peer.

    return True


def generate_recommendations(
    scenarios: list[Scenario],
    vulnerability_report: VulnerabilityReport,
    graph: Graph,
) -> list[Recommendation]:
    """Produce prioritised recommendations from scenario analysis and the
    vulnerability report.

    Examines failure frequency across scenarios, node properties, bridge
    status, and layer autonomy to propose concrete improvements.
    """
    # -- Count failure frequency across scenarios --------------------------
    failure_freq: dict[str, int] = {}
    for sc in scenarios:
        for step in sc.path:
            for fid_str in step.get("new_failures", []):
                # new_failures from extract_path may be indices (str of int).
                try:
                    fid_int = int(fid_str)
                    node_id = graph.nodes[fid_int].id
                except ValueError, IndexError:
                    node_id = fid_str
                failure_freq[node_id] = failure_freq.get(node_id, 0) + 1

    # Top-10 most frequently failing nodes.
    priority_nodes = sorted(failure_freq.items(), key=lambda kv: kv[1], reverse=True)[:10]

    recommendations: list[Recommendation] = []
    num_scenarios = max(len(scenarios), 1)

    for node_id, frequency in priority_nodes:
        try:
            node = graph.get_node(node_id)
        except KeyError:
            continue

        # High theta + no redundancy -> add redundancy.
        if node.theta > 0.7 and _has_no_redundancy(node_id, graph):
            recommendations.append(
                Recommendation(
                    type="add_redundancy",
                    target=node_id,
                    action=f"Create a backup or alternative for {node.name}",
                    reason=(
                        f"{node.name} appears in {frequency}/{num_scenarios} "
                        f"worst scenarios with theta={node.theta:.2f} and no backup"
                    ),
                    estimated_resilience_gain="High",
                    scenarios_prevented=frequency,
                )
            )

        # Bridge node -> add bypass.
        if _is_bridge_node(node_id, vulnerability_report):
            recommendations.append(
                Recommendation(
                    type="add_bypass",
                    target=node_id,
                    action=(f"Create alternative connections that bypass {node.name}"),
                    reason=(f"{node.name} is a bridge node -- removing it fragments the network"),
                    estimated_resilience_gain="High",
                    scenarios_prevented=frequency,
                )
            )

        # High recovery cost -> reduce recovery time.
        median_r = sorted(n.r for n in graph.nodes)[len(graph.nodes) // 2]
        high_recovery_threshold = max(median_r * 2.0, 1.0)
        if node.r > high_recovery_threshold:
            recommendations.append(
                Recommendation(
                    type="reduce_recovery_time",
                    target=node_id,
                    action=(f"Prepare contingency plan to speed up recovery of {node.name}"),
                    reason=(
                        f"{node.name} has recovery cost of {node.r:.1f} -- too slow to restore"
                    ),
                    estimated_resilience_gain="Medium",
                    scenarios_prevented=frequency,
                )
            )

    # -- Layer-level recommendations ---------------------------------------
    layer_analysis: dict[str, Any] = getattr(vulnerability_report, "layer_analysis", {})
    if isinstance(layer_analysis, dict):
        for layer_name, analysis in layer_analysis.items():
            autonomy = (
                analysis.get("autonomy", 1.0)
                if isinstance(analysis, dict)
                else getattr(analysis, "autonomy", 1.0)
            )
            if autonomy < 0.3:
                recommendations.append(
                    Recommendation(
                        type="increase_layer_autonomy",
                        target=layer_name,
                        action=f"Build internal redundancy within {layer_name} layer",
                        reason=(
                            f"{layer_name} layer has autonomy of only "
                            f"{autonomy:.0%} -- almost entirely dependent "
                            f"on other layers"
                        ),
                        estimated_resilience_gain="Major",
                        scenarios_prevented=0,
                    )
                )

    # -- Assign priorities (1 = highest) -----------------------------------
    recommendations.sort(key=lambda r: r.scenarios_prevented, reverse=True)
    for i, rec in enumerate(recommendations, start=1):
        rec.priority = i

    return recommendations


# ---------------------------------------------------------------------------
# Step 3: Animation precomputation
# ---------------------------------------------------------------------------


def precompute_animation(
    scenario: Scenario,
    graph: Graph,
) -> list[AnimationFrame]:
    """Build frame-by-frame cascade animation data for the frontend.

    Frame 0 is the initial healthy state.  For each step in the scenario
    path the triggering event is applied and the cascade propagated one
    step at a time, producing one animation frame per cascade step.
    """
    from achilles_api.engine.cascade import _propagate_step, apply_event

    frames: list[AnimationFrame] = []

    # Start from a pristine graph copy.
    g_anim = graph.deep_copy()
    g_anim.reset()
    g_anim.build_adjacency_matrix()

    # Frame 0: initial state.
    frames.append(
        AnimationFrame(
            step=0,
            node_healths={n.id: n.h for n in g_anim.nodes},
            node_failed={n.id: n.phi for n in g_anim.nodes},
            event=None,
            H=g_anim.network_health(),
        )
    )

    for path_step in scenario.path:
        event = path_step.get("event")
        if event is None:
            continue

        # Apply the event.
        new_failures, new_degraded = apply_event(g_anim, event)

        frames.append(
            AnimationFrame(
                step=len(frames),
                node_healths={n.id: n.h for n in g_anim.nodes},
                node_failed={n.id: n.phi for n in g_anim.nodes},
                event=event.to_dict() if hasattr(event, "to_dict") else None,
                H=g_anim.network_health(),
            )
        )

        # Run cascade step-by-step (each propagation round = one frame).
        changed: set[str] = new_failures | new_degraded
        max_cascade_steps: int = len(g_anim.nodes)
        cascade_step = 0

        while changed and cascade_step < max_cascade_steps:
            cascade_step += 1
            next_failures, next_degraded, _damages, _ = _propagate_step(g_anim, changed)
            if not next_failures and not next_degraded:
                break

            frames.append(
                AnimationFrame(
                    step=len(frames),
                    node_healths={n.id: n.h for n in g_anim.nodes},
                    node_failed={n.id: n.phi for n in g_anim.nodes},
                    event=None,
                    H=g_anim.network_health(),
                )
            )

            changed = next_failures | next_degraded

    return frames


# ---------------------------------------------------------------------------
# Step 4: Final report
# ---------------------------------------------------------------------------


def build_final_report(
    graph: Graph,
    tree: StateTree,
    vulnerability_report: VulnerabilityReport,
    *,
    top_k: int = 10,
    r_unit: str = "days",
    resilience_profile: dict[str, Any] | None = None,
) -> FinalReport:
    """Assemble the complete analysis report.

    Combines metadata, health scores, vulnerability summary, ranked
    scenarios (with paths and animation data), and recommendations into
    a single :class:`FinalReport`.  Optionally includes a Monte Carlo
    resilience profile.
    """
    # -- Scenarios ---------------------------------------------------------
    scenarios = extract_scenarios(tree, graph, top_k=top_k)

    # Pre-compute animation frames for each scenario.
    for sc in scenarios:
        sc.animation_frames = precompute_animation(sc, graph)

    # -- Recommendations ---------------------------------------------------
    recs = generate_recommendations(scenarios, vulnerability_report, graph)

    # -- Metadata ----------------------------------------------------------
    stats = tree_stats(tree)
    metadata: dict[str, Any] = {
        "timestamp": datetime.now(UTC).isoformat(),
        "graph_size": {
            "nodes": len(graph.nodes),
            "edges": len(graph.edges),
            "layers": len(graph.layers),
        },
        "tree_stats": stats,
        "r_unit": r_unit,
    }

    # -- Network health ----------------------------------------------------
    overall_H = graph.network_health()
    per_layer: dict[str, float] = {}
    for layer in graph.layers:
        per_layer[layer] = graph.layer_health(layer)

    network_health: dict[str, Any] = {
        "overall": overall_H,
        "per_layer": per_layer,
    }

    # -- Vulnerability summary ---------------------------------------------
    vuln_summary: dict[str, Any] = {}

    # Most critical node.
    node_rankings: list[Any] = getattr(vulnerability_report, "node_rankings", [])
    if node_rankings:
        top_node = node_rankings[0]
        # NodeImpact dataclass uses ``node_id``; dict uses ``id``.
        node_id = (
            top_node.get("id")
            if isinstance(top_node, dict)
            else getattr(top_node, "node_id", None) or getattr(top_node, "id", None)
        )
        node_theta = None
        node_impact = None
        if isinstance(top_node, dict):
            node_theta = top_node.get("theta")
            node_impact = top_node.get("health_loss")
        else:
            node_theta = getattr(top_node, "theta", None)
            node_impact = getattr(top_node, "health_loss", None)
        try:
            critical_node = graph.get_node(node_id) if node_id else None
            node_name = critical_node.name if critical_node else node_id
            if node_theta is None and critical_node is not None:
                node_theta = critical_node.theta
        except KeyError:
            node_name = node_id
        vuln_summary["most_critical_node"] = {
            "id": node_id,
            "name": node_name,
            "theta": node_theta,
            "impact": node_impact,
        }

    # Most fragile layer.
    layer_analysis: Any = getattr(vulnerability_report, "layer_analysis", {})
    if isinstance(layer_analysis, dict) and layer_analysis:
        fragile_layer = min(
            layer_analysis.items(),
            key=lambda kv: (
                kv[1].get("autonomy", 1.0)
                if isinstance(kv[1], dict)
                else getattr(kv[1], "autonomy", 1.0)
            ),
        )
        fl_name = fragile_layer[0]
        fl_data = fragile_layer[1]
        fl_autonomy = (
            fl_data.get("autonomy", 0.0)
            if isinstance(fl_data, dict)
            else getattr(fl_data, "autonomy", 0.0)
        )
        fl_criticality = (
            fl_data.get("criticality", 0.0)
            if isinstance(fl_data, dict)
            else getattr(fl_data, "criticality", 0.0)
        )
        vuln_summary["most_fragile_layer"] = {
            "name": fl_name,
            "autonomy": fl_autonomy,
            "criticality": fl_criticality,
        }

    # Bridge count.
    bridge_nodes: list[Any] = getattr(vulnerability_report, "bridge_nodes", [])
    vuln_summary["bridge_count"] = len(bridge_nodes)

    # Highest synergy pair.
    compound_pairs: list[Any] = getattr(vulnerability_report, "compound_pairs", [])
    if compound_pairs:
        top_pair = compound_pairs[0]
        if isinstance(top_pair, dict):
            vuln_summary["highest_synergy_pair"] = {
                "nodes": [top_pair.get("node_a"), top_pair.get("node_b")],
                "synergy_ratio": top_pair.get("synergy_ratio"),
            }
        else:
            vuln_summary["highest_synergy_pair"] = {
                "nodes": [
                    getattr(top_pair, "node_a", None),
                    getattr(top_pair, "node_b", None),
                ],
                "synergy_ratio": getattr(top_pair, "synergy_ratio", None),
            }

    # -- Visualization data ------------------------------------------------
    cascade_animations: list[dict[str, Any]] = []
    for sc in scenarios:
        cascade_animations.append(
            {
                "scenario_rank": sc.rank,
                "frames": (
                    [f.to_dict() for f in sc.animation_frames]
                    if sc.animation_frames is not None
                    else []
                ),
            }
        )

    # Build simplified tree for frontend rendering.
    tree_viz_nodes = []
    tree_viz_edges = []
    for tn in tree.all_nodes:
        tree_viz_nodes.append(
            {
                "id": tn.id,
                "H": round(tn.H, 6),
                "depth": tn.depth,
                "agent": tn.agent,
                "scenario_title": tn.scenario_title,
                "step_description": tn.step_description,
                "expected_outcome": tn.expected_outcome,
                "event_summary": (f"{tn.event.action} {tn.event.target}" if tn.event else "root"),
                "failed_count": tn.failed_count,
            }
        )
        if tn.parent is not None:
            tree_viz_edges.append({"from": tn.parent.id, "to": tn.id})

    visualization_data: dict[str, Any] = {
        "graph": graph.to_dict(),
        "state_tree": {
            "nodes": tree_viz_nodes,
            "edges": tree_viz_edges,
        },
        "cascade_animations": cascade_animations,
    }

    return FinalReport(
        metadata=metadata,
        network_health=network_health,
        vulnerability_summary=vuln_summary,
        worst_scenarios=scenarios,
        recommendations=recs,
        visualization_data=visualization_data,
        resilience_profile=resilience_profile,
    )


# ---------------------------------------------------------------------------
# AI Narrative Generation
# ---------------------------------------------------------------------------

_NARRATIVE_SYSTEM_PROMPT = """\
You are a risk analyst presenting findings to a business leader.
You will receive a mathematical analysis of a worst-case failure scenario \
for their organization's network. Translate it into a clear, actionable \
narrative."""

_NARRATIVE_USER_TEMPLATE = """\
SCENARIO DATA:
{scenario_json}

GRAPH CONTEXT:
{graph_context}

RULES:
- Lead with the business impact, not the math
- Use specific node names (e.g. "your head chef Dimitar" not "node_7")
- Describe the cascade as a story with a timeline
- Quantify damage in business terms (revenue, capacity, time)
- End with 2-3 specific, actionable recommendations
- Keep it to 1 paragraph per cascade step
- Reference the exact numbers from the analysis

OUTPUT FORMAT (valid JSON):
{{
    "title": "Short scenario name (e.g. 'The Supply Chain Collapse')",
    "severity_label": "Critical | High | Medium | Low",
    "summary": "One sentence summary",
    "narrative": "Full story of the cascade",
    "timeline": [
        {{"step": 1, "description": "What happens first"}},
        {{"step": 2, "description": "What happens next"}}
    ],
    "business_impact": {{
        "estimated_revenue_loss": "percentage or description",
        "recovery_time": "estimated time to full recovery",
        "affected_operations": ["list of affected areas"]
    }},
    "recommendations": [
        {{
            "action": "What to do",
            "cost_estimate": "Rough cost",
            "impact": "How much this improves resilience"
        }}
    ]
}}"""


def _build_graph_context(graph: Graph) -> str:
    """Build a concise textual description of the graph for the AI prompt."""
    node_descs: list[str] = []
    for n in graph.nodes:
        desc = (
            f"  {n.id}: {n.name} (layer={n.layer}, "
            f"importance={n.theta:.2f}, recovery_cost={n.r:.1f})"
        )
        node_descs.append(desc)

    layer_desc = ", ".join(graph.layers) if graph.layers else "(none)"

    return (
        f"Layers: {layer_desc}\n"
        f"Nodes ({len(graph.nodes)}):\n" + "\n".join(node_descs) + "\n"
        f"Edges: {len(graph.edges)} dependencies"
    )


def _build_scenario_json(scenario: Scenario) -> str:
    """Serialise a scenario to JSON for the AI prompt, omitting heavy fields."""
    data: dict[str, Any] = {
        "rank": scenario.rank,
        "severity": scenario.severity,
        "severity_label": scenario.severity_label,
        "title": scenario.title,
        "summary": scenario.summary,
        "health_remaining": scenario.health_remaining,
        "health_lost": scenario.health_lost,
        "intended_outcome": scenario.intended_outcome,
        "failed_nodes": scenario.failed_nodes,
        "failed_fraction": scenario.failed_fraction,
        "recovery_cost": scenario.recovery_cost,
        "depth": scenario.depth,
        "agent": scenario.agent,
        "layers_affected": scenario.layers_affected,
        "cross_layer_events": scenario.cross_layer_events,
        "path": [
            {
                "step": step.get("step"),
                "event": (
                    step["event"].to_dict()
                    if hasattr(step.get("event"), "to_dict")
                    else step.get("event")
                ),
                "H_before": step.get("H_before"),
                "H_after": step.get("H_after"),
                "delta_H": step.get("delta_H"),
                "new_failures": step.get("new_failures"),
                "step_description": step.get("step_description"),
                "expected_outcome": step.get("expected_outcome"),
            }
            for step in scenario.path
        ],
    }
    return json.dumps(data, indent=2, default=str)


async def generate_narrative(
    scenario: Scenario,
    graph: Graph,
) -> dict[str, Any]:
    """Call the Gemini API to generate a human-readable narrative for a
    single scenario.

    Requires the ``GEMINI_API_KEY`` environment variable to be set.

    Returns the parsed JSON response from the model containing ``title``,
    ``severity_label``, ``summary``, ``narrative``, ``timeline``,
    ``business_impact``, and ``recommendations``.
    """
    import google.genai as genai
    from google.genai import types

    from achilles_api.gemini import generate_content_with_fallback

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        logger.warning("GEMINI_API_KEY not set -- returning empty narrative")
        return {}

    client = genai.Client(api_key=api_key)

    scenario_json = _build_scenario_json(scenario)
    graph_context = _build_graph_context(graph)

    user_message = _NARRATIVE_USER_TEMPLATE.format(
        scenario_json=scenario_json,
        graph_context=graph_context,
    )

    try:
        response = await generate_content_with_fallback(
            client,
            primary_model="gemini-2.5-flash",
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=_NARRATIVE_SYSTEM_PROMPT,
                temperature=0.2,
                max_output_tokens=2048,
                response_mime_type="application/json",
            ),
        )

        text = response.text or ""

        # Parse the JSON from the response.
        # The model may wrap the JSON in markdown code fences.
        cleaned = text.strip()
        if cleaned.startswith("```"):
            # Remove opening fence (possibly with language tag).
            first_newline = cleaned.index("\n")
            cleaned = cleaned[first_newline + 1 :]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        result: dict[str, Any] = json.loads(cleaned)
        return result

    except Exception as exc:
        logger.error("Narrative generation failed: %s", exc)
        return {
            "title": f"Scenario {scenario.rank}",
            "severity_label": scenario.severity_label,
            "summary": (
                f"Network health drops to {scenario.health_remaining:.0%} "
                f"with {len(scenario.failed_nodes)} node failures."
            ),
            "narrative": "",
            "timeline": [],
            "business_impact": {},
            "recommendations": [],
            "error": str(exc),
        }


async def generate_all_narratives(
    scenarios: list[Scenario],
    graph: Graph,
) -> list[dict[str, Any]]:
    """Generate AI narratives for all scenarios sequentially.

    Each narrative is attached to its corresponding :class:`Scenario` object
    as well as returned in the list.
    """
    results: list[dict[str, Any]] = []
    for scenario in scenarios:
        narrative = await generate_narrative(scenario, graph)
        scenario.narrative = narrative

        # Back-fill title and summary from the narrative if present.
        if narrative.get("title") and not scenario.title:
            scenario.title = narrative["title"]
        if narrative.get("summary") and not scenario.summary:
            scenario.summary = narrative["summary"]
        if narrative.get("severity_label") and not scenario.severity_label:
            scenario.severity_label = narrative["severity_label"]

        results.append(narrative)

    return results
