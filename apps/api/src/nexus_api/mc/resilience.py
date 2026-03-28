"""Post-tree Monte Carlo resilience analysis.

Runs N independent cascade simulations from the pristine graph with random
events, then aggregates statistical metrics into a :class:`ResilienceProfile`.

This complements the state-tree exploration (which finds specific disaster
paths) with a statistical view: mean health, variance, catastrophic collapse
probability, and per-node failure frequency.
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import numpy as np

from nexus_api.engine.cascade import cascade
from nexus_api.mc.config import MCConfig
from nexus_api.models.events import Event

if TYPE_CHECKING:
    from nexus_api.models.graph import Graph

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ResilienceProfile:
    """Statistical resilience metrics from bulk Monte Carlo simulation.

    All probabilities and health values are in ``[0, 1]``.
    """

    n_samples: int
    mean_H: float
    std_H: float
    min_H: float
    max_H: float
    p_catastrophic: float
    p_severe: float
    per_node_failure_prob: dict[str, float]
    H_percentiles: dict[str, float]
    layer_mean_damage: dict[str, float]
    sample_H_values: list[float] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "n_samples": self.n_samples,
            "mean_H": round(self.mean_H, 6),
            "std_H": round(self.std_H, 6),
            "min_H": round(self.min_H, 6),
            "max_H": round(self.max_H, 6),
            "p_catastrophic": round(self.p_catastrophic, 6),
            "p_severe": round(self.p_severe, 6),
            "per_node_failure_prob": {
                k: round(v, 6) for k, v in self.per_node_failure_prob.items()
            },
            "H_percentiles": {
                k: round(v, 6) for k, v in self.H_percentiles.items()
            },
            "layer_mean_damage": {
                k: round(v, 6) for k, v in self.layer_mean_damage.items()
            },
            "sample_H_values": [round(v, 6) for v in self.sample_H_values],
        }


# ---------------------------------------------------------------------------
# Event sampling (shared logic with MonteCarloAgent)
# ---------------------------------------------------------------------------


def _sample_event(graph: Graph, mc_config: MCConfig) -> Event | None:
    """Sample a single random event from the pristine graph."""
    surviving = [n for n in graph.nodes if not n.phi]
    if not surviving:
        return None

    node_index = graph.node_index
    alive_edges = [
        e for e in graph.edges
        if (
            not graph.nodes[node_index[e.from_id]].phi
            and not graph.nodes[node_index[e.to_id]].phi
        )
    ]

    # Pick action
    roll = random.random()
    if roll < mc_config.kill_prob:
        action = "kill"
    elif roll < mc_config.kill_prob + mc_config.damage_prob:
        action = "damage"
    elif alive_edges:
        action = "cut_edge"
    else:
        action = "kill" if random.random() < 0.5 else "damage"

    if action == "cut_edge":
        edge = random.choice(alive_edges)
        return Event(
            target={"from": edge.from_id, "to": edge.to_id},
            action="cut_edge",
        )

    # Node selection weights
    if mc_config.failure_model == "uniform":
        weights = [1.0] * len(surviving)
    elif mc_config.failure_model == "weighted_theta":
        weights = [n.theta for n in surviving]
        if sum(weights) == 0.0:
            weights = [1.0] * len(surviving)
    else:  # per_node
        weights = [mc_config.per_node_probs.get(n.id, 1.0) for n in surviving]
        if sum(weights) == 0.0:
            weights = [1.0] * len(surviving)

    node = random.choices(surviving, weights=weights, k=1)[0]

    if action == "kill":
        return Event(target=node.id, action="kill")

    magnitude = random.uniform(
        mc_config.damage_magnitude_min, mc_config.damage_magnitude_max,
    )
    return Event(target=node.id, action="damage", magnitude=magnitude)


# ---------------------------------------------------------------------------
# Bulk resilience runner
# ---------------------------------------------------------------------------


def run_resilience_analysis(
    graph: Graph,
    mc_config: MCConfig,
) -> ResilienceProfile:
    """Run N independent cascade simulations and aggregate statistics.

    Each simulation:
    1. Deep-copies the pristine graph.
    2. Samples a random event.
    3. Runs a full cascade to fixed point.
    4. Records the final network health and per-node failure state.

    Parameters
    ----------
    graph : Graph
        The pristine network graph (all nodes healthy).
    mc_config : MCConfig
        Monte Carlo configuration.

    Returns
    -------
    ResilienceProfile
        Statistical resilience metrics.
    """
    n = mc_config.n_resilience_samples
    node_ids = [node.id for node in graph.nodes]
    n_nodes = len(node_ids)
    layers = list(graph.layers)

    h_values: list[float] = []
    failure_counts: dict[str, int] = {nid: 0 for nid in node_ids}
    layer_damage_accum: dict[str, float] = {layer: 0.0 for layer in layers}
    baseline_H = graph.network_health()
    baseline_layer_H = {layer: graph.layer_health(layer) for layer in layers}

    skipped = 0
    for i in range(n):
        g_copy = graph.deep_copy()
        event = _sample_event(g_copy, mc_config)
        if event is None:
            skipped += 1
            continue

        try:
            _log, final_state, _metrics = cascade(g_copy, event)
        except (ValueError, KeyError):
            skipped += 1
            continue

        h_values.append(final_state.H)

        # Per-node failure tracking
        for nid, phi in zip(node_ids, final_state.phi, strict=True):
            if phi:
                failure_counts[nid] += 1

        # Per-layer damage tracking
        for layer in layers:
            layer_H_after = final_state.H_per_layer.get(layer, 0.0)
            layer_damage_accum[layer] += baseline_layer_H[layer] - layer_H_after

    actual_n = len(h_values)
    if actual_n == 0:
        return ResilienceProfile(
            n_samples=0,
            mean_H=baseline_H,
            std_H=0.0,
            min_H=baseline_H,
            max_H=baseline_H,
            p_catastrophic=0.0,
            p_severe=0.0,
            per_node_failure_prob={nid: 0.0 for nid in node_ids},
            H_percentiles={"p5": baseline_H, "p25": baseline_H, "p50": baseline_H,
                           "p75": baseline_H, "p95": baseline_H},
            layer_mean_damage={layer: 0.0 for layer in layers},
            sample_H_values=[],
        )

    h_arr = np.array(h_values, dtype=np.float64)

    mean_H = float(np.mean(h_arr))
    std_H = float(np.std(h_arr))
    min_H = float(np.min(h_arr))
    max_H = float(np.max(h_arr))
    p_catastrophic = float(np.mean(h_arr < 0.3))
    p_severe = float(np.mean(h_arr < 0.5))

    percentiles = {
        "p5": float(np.percentile(h_arr, 5)),
        "p25": float(np.percentile(h_arr, 25)),
        "p50": float(np.percentile(h_arr, 50)),
        "p75": float(np.percentile(h_arr, 75)),
        "p95": float(np.percentile(h_arr, 95)),
    }

    per_node_prob = {
        nid: count / actual_n for nid, count in failure_counts.items()
    }

    layer_mean = {
        layer: dmg / actual_n for layer, dmg in layer_damage_accum.items()
    }

    # Cap sample values at 1000 for response size
    sample_values = h_values[:1000]

    logger.info(
        "Resilience analysis complete: %d samples (skipped %d), "
        "mean_H=%.4f, std=%.4f, P(catastrophic)=%.4f",
        actual_n, skipped, mean_H, std_H, p_catastrophic,
    )

    return ResilienceProfile(
        n_samples=actual_n,
        mean_H=mean_H,
        std_H=std_H,
        min_H=min_H,
        max_H=max_H,
        p_catastrophic=p_catastrophic,
        p_severe=p_severe,
        per_node_failure_prob=per_node_prob,
        H_percentiles=percentiles,
        layer_mean_damage=layer_mean,
        sample_H_values=sample_values,
    )
