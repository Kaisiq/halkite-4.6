"""Topology-aware weight inference engine.

Refines initial edge weights (priors from scoring.py) using six independent
structural analysis methods, fused via Robust Rank Aggregation (RRA).

Methods:
  1. Spectral sensitivity     — dλ₂/dw_ij via Laplacian perturbation theory
  2. Information-theoretic    — von Neumann entropy edge sensitivity
  3. Probabilistic cascade    — Monte Carlo independent cascade model
  4. Percolation criticality  — edge contribution to giant component survival
  5. GBB resilience           — Gao-Barzel-Barabasi effective dynamics
  6. Perturbation response    — steady-state sensitivity via Jacobian analysis

References:
  [1] Gao, Barzel, Barabasi. Nature 530, 307-312 (2016).
  [2] Fiedler. Czech Math J (1973).
  [3] Braunstein, Ghosh, Severini. Annals of Combinatorics (2006).
  [4] Kempe, Kleinberg, Tardos. KDD (2003).
  [5] Callaway et al. Phys Rev Lett (2000).

This module is pure and deterministic (seeded RNG). AI never touches the numbers.
"""

from __future__ import annotations

import copy
import logging
import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

import networkx as nx
import numpy as np
from scipy import stats

from achilles_api.models.graph import Graph

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class InferenceConfig:
    """Tuneable parameters for the weight inference pipeline."""

    # Cascade simulation
    cascade_simulations: int = 5000
    cascade_max_steps: int = 20

    # Percolation
    percolation_samples: int = 200
    percolation_resolution: int = 50

    # GBB dynamics
    gbb_self_regulation: float = 1.0
    gbb_alpha: float = 1.0
    gbb_hill_coeff: float = 2.0

    # Perturbation analysis
    perturbation_epsilon: float = 1e-4

    # Method weights for rank aggregation
    method_weights: dict[str, float] = field(
        default_factory=lambda: {
            "spectral": 1.0,
            "info_theoretic": 1.0,
            "cascade": 1.2,
            "percolation": 1.0,
            "gbb": 1.1,
            "perturbation": 1.0,
        }
    )

    # Blending: final_weight = prior_blend * prior + (1 - prior_blend) * structural
    # This ensures the AI-extracted prior always contributes.
    prior_blend: float = 0.35

    # Random seed for reproducibility
    seed: int = 42


# ---------------------------------------------------------------------------
# Utility: convert Achilles Graph -> networkx + matrices
# ---------------------------------------------------------------------------


def _to_networkx(graph: Graph) -> nx.DiGraph:
    """Build a networkx DiGraph from an Achilles Graph, using current edge
    weights as the 'prior' attribute."""
    g = nx.DiGraph()
    for node in graph.nodes:
        g.add_node(node.id, layer=node.layer, theta=node.theta)
    for edge in graph.edges:
        g.add_edge(
            edge.from_id,
            edge.to_id,
            prior=edge.weight,
            meta=copy.deepcopy(edge.meta),
        )
    return g


def _node_index(g: nx.DiGraph) -> dict[str, int]:
    """Stable node -> integer index mapping."""
    return {n: i for i, n in enumerate(sorted(g.nodes()))}


def _weighted_adjacency(
    g: nx.DiGraph, idx: dict[str, int], weight_key: str = "prior"
) -> np.ndarray:
    """Weighted adjacency matrix (symmetrised for spectral methods)."""
    n = len(idx)
    a = np.zeros((n, n))
    for u, v, d in g.edges(data=True):
        w = d.get(weight_key, 0.5)
        i, j = idx[u], idx[v]
        a[i][j] = w
        a[j][i] = w
    return a


def _laplacian(a: np.ndarray) -> np.ndarray:
    """Combinatorial Laplacian: L = D - A."""
    return np.diag(a.sum(axis=1)) - a


# ---------------------------------------------------------------------------
# Method 1: Spectral Sensitivity
# ---------------------------------------------------------------------------


def _spectral_edge_sensitivity(g: nx.DiGraph, config: InferenceConfig) -> dict:
    """Edge importance via Fiedler value sensitivity and effective resistance."""
    idx = _node_index(g)
    n = len(idx)
    if n < 3:
        return dict.fromkeys(g.edges(), 0.5)

    a = _weighted_adjacency(g, idx)
    big_l = _laplacian(a)

    eigenvalues, eigenvectors = np.linalg.eigh(big_l)
    v2 = eigenvectors[:, 1]

    # Pseudoinverse of L for effective resistance
    l_pinv = np.zeros((n, n))
    for k in range(n):
        if eigenvalues[k] > 1e-10:
            l_pinv += (1.0 / eigenvalues[k]) * np.outer(
                eigenvectors[:, k], eigenvectors[:, k]
            )

    results = {}
    for u, v in g.edges():
        i, j = idx[u], idx[v]
        fiedler_sens = (v2[i] - v2[j]) ** 2
        eff_resistance = l_pinv[i, i] + l_pinv[j, j] - 2 * l_pinv[i, j]
        results[(u, v)] = fiedler_sens * (1 + abs(eff_resistance))

    return results


# ---------------------------------------------------------------------------
# Method 2: Information-Theoretic Edge Importance
# ---------------------------------------------------------------------------


def _information_theoretic_weights(g: nx.DiGraph, config: InferenceConfig) -> dict:
    """Edge importance via von Neumann entropy sensitivity."""
    idx = _node_index(g)
    n = len(idx)
    if n < 3:
        return dict.fromkeys(g.edges(), 0.5)

    a = _weighted_adjacency(g, idx)
    big_l = _laplacian(a)

    def von_neumann_entropy(laplacian: np.ndarray) -> float:
        trace = np.trace(laplacian)
        if trace < 1e-12:
            return 0.0
        rho = laplacian / trace
        eigs = np.linalg.eigvalsh(rho)
        eigs = eigs[eigs > 1e-15]
        return float(-np.sum(eigs * np.log2(eigs)))

    s_full = von_neumann_entropy(big_l)

    # Edge betweenness centrality
    u_graph = g.to_undirected()
    for _uu, _vv, d in u_graph.edges(data=True):
        if "prior" not in d:
            d["prior"] = 0.5
    try:
        ebc = nx.edge_betweenness_centrality(
            u_graph, weight="prior", normalized=True
        )
    except Exception:
        ebc = dict.fromkeys(u_graph.edges(), 0.5)

    results = {}
    for u, v in g.edges():
        i, j = idx[u], idx[v]
        a_reduced = a.copy()
        a_reduced[i, j] = 0
        a_reduced[j, i] = 0
        l_reduced = _laplacian(a_reduced)

        entropy_delta = abs(s_full - von_neumann_entropy(l_reduced))
        eb = ebc.get((u, v), ebc.get((v, u), 0))
        results[(u, v)] = entropy_delta * (1 + eb)

    return results


# ---------------------------------------------------------------------------
# Method 3: Probabilistic Cascade Model
# ---------------------------------------------------------------------------


def _cascade_edge_importance(g: nx.DiGraph, config: InferenceConfig) -> dict:
    """Monte Carlo independent cascade model edge importance."""
    rng = np.random.default_rng(config.seed)
    nodes = list(g.nodes())
    n = len(nodes)
    if n < 2:
        return dict.fromkeys(g.edges(), 0.5)

    edge_fire_count: dict[tuple, int] = defaultdict(int)
    edge_cascade_sizes: dict[tuple, list] = defaultdict(list)

    for _ in range(config.cascade_simulations):
        seed_node = nodes[rng.integers(n)]
        active = {seed_node}
        newly_active = {seed_node}
        fired_edges: set[tuple] = set()

        for _step in range(config.cascade_max_steps):
            if not newly_active:
                break
            next_active: set = set()
            for node in newly_active:
                for _, neighbor, data in g.out_edges(node, data=True):
                    if neighbor not in active:
                        p = data.get("prior", 0.5)
                        if rng.random() < p:
                            next_active.add(neighbor)
                            fired_edges.add((node, neighbor))
            active |= next_active
            newly_active = next_active

        cascade_size = len(active)
        for e in fired_edges:
            edge_fire_count[e] += 1
            edge_cascade_sizes[e].append(cascade_size)

    results = {}
    for u, v in g.edges():
        e = (u, v)
        fires = edge_fire_count.get(e, 0)
        if fires > 0:
            avg_cascade = np.mean(edge_cascade_sizes[e])
            freq = fires / config.cascade_simulations
            score = freq * (avg_cascade / n)
        else:
            score = 0.0
        results[(u, v)] = score

    return results


# ---------------------------------------------------------------------------
# Method 4: Percolation Criticality
# ---------------------------------------------------------------------------


def _percolation_edge_criticality(g: nx.DiGraph, config: InferenceConfig) -> dict:
    """Edge contribution to giant connected component survival."""
    rng = np.random.default_rng(config.seed + 1)
    u_graph = g.to_undirected()
    all_edges = list(u_graph.edges())
    n = u_graph.number_of_nodes()
    m = len(all_edges)

    if n < 3 or m < 2:
        return dict.fromkeys(g.edges(), 0.5)

    phis = np.linspace(0, 1, config.percolation_resolution)

    def percolation_curve(
        graph: nx.Graph, edges_list: list, n_nodes: int
    ) -> np.ndarray:
        curve = np.zeros(len(phis))
        for _trial in range(config.percolation_samples):
            perm = rng.permutation(len(edges_list))
            for k, phi in enumerate(phis):
                n_remove = int(phi * len(edges_list))
                edges_to_remove = set(perm[:n_remove])
                h = nx.Graph()
                h.add_nodes_from(graph.nodes())
                for idx_e, e in enumerate(edges_list):
                    if idx_e not in edges_to_remove:
                        h.add_edge(*e)
                if h.number_of_nodes() > 0:
                    gcc = max(nx.connected_components(h), key=len)
                    curve[k] += len(gcc) / n_nodes
        curve /= config.percolation_samples
        return curve

    # For larger graphs, fall back to edge betweenness — the full
    # percolation loop is O(E * samples * resolution * (V+E)) per edge.
    directed_edges = list(g.edges())
    if len(directed_edges) > 30:
        ebc = nx.edge_betweenness_centrality(u_graph, normalized=True)
        results = {}
        for u, v in directed_edges:
            results[(u, v)] = ebc.get((u, v), ebc.get((v, u), 0))
        return results

    baseline_curve = percolation_curve(u_graph, all_edges, n)
    baseline_auc = float(np.trapezoid(baseline_curve, phis))

    results = {}
    for u, v in directed_edges:
        u_reduced = u_graph.copy()
        if u_reduced.has_edge(u, v):
            u_reduced.remove_edge(u, v)
        reduced_edges = list(u_reduced.edges())
        reduced_curve = percolation_curve(u_reduced, reduced_edges, n)
        reduced_auc = float(np.trapezoid(reduced_curve, phis))
        results[(u, v)] = max(0, baseline_auc - reduced_auc)

    return results


# ---------------------------------------------------------------------------
# Method 5: GBB Resilience Framework
# ---------------------------------------------------------------------------


def _gbb_resilience_analysis(g: nx.DiGraph, config: InferenceConfig) -> dict:
    """Gao-Barzel-Barabasi effective dynamics edge importance."""
    idx = _node_index(g)
    n = len(idx)
    if n < 2:
        return dict.fromkeys(g.edges(), 0.5)

    a = _weighted_adjacency(g, idx)

    # Node strengths
    s = a.sum(axis=1)
    s_mean = np.mean(s)
    s2_mean = np.mean(s**2)

    mask = a > 0
    a_mean = a[mask].mean() if mask.any() else 0.5
    m_edges = mask.sum() / 2

    results = {}
    for u, v in g.edges():
        i, j = idx[u], idx[v]

        ds_mean = 2.0 / n
        ds2_mean = 2.0 * (s[i] + s[j]) / n
        da_mean = 1.0 / max(m_edges, 1)

        if s2_mean > 1e-12:
            d_ratio = (
                2 * s_mean * ds_mean * s2_mean - s_mean**2 * ds2_mean
            ) / s2_mean**2
        else:
            d_ratio = 0

        d_beta = d_ratio * a_mean + (s_mean**2 / max(s2_mean, 1e-12)) * da_mean
        results[(u, v)] = abs(d_beta)

    return results


# ---------------------------------------------------------------------------
# Method 6: Perturbation Response (Jacobian-based)
# ---------------------------------------------------------------------------


def _perturbation_sensitivity(g: nx.DiGraph, config: InferenceConfig) -> dict:
    """Steady-state perturbation analysis via Sherman-Morrison updates."""
    idx = _node_index(g)
    n = len(idx)
    if n < 2:
        return dict.fromkeys(g.edges(), 0.5)

    a = _weighted_adjacency(g, idx)
    eye = np.eye(n)

    spectral_radius = max(abs(np.linalg.eigvals(a)))
    a_scaled = a / (spectral_radius + 0.1) if spectral_radius >= 1 else a

    big_m = eye - a_scaled
    b = np.ones(n)

    try:
        m_inv = np.linalg.inv(big_m)
        x_star = m_inv @ b
    except np.linalg.LinAlgError:
        return dict.fromkeys(g.edges(), 0.5)

    results = {}
    eps = config.perturbation_epsilon

    for u, v in g.edges():
        i, j = idx[u], idx[v]
        col_i = m_inv[:, i]
        row_j = m_inv[j, :]
        denominator = 1.0 - eps * m_inv[j, i]

        if abs(denominator) < 1e-15:
            # Near-singular: cap at 10/eps to avoid outlier blowup
            results[(u, v)] = 10.0 / eps
            continue

        delta_m_inv = eps * np.outer(col_i, row_j) / denominator
        x_perturbed = (m_inv + delta_m_inv) @ b
        displacement = np.linalg.norm(x_perturbed - x_star)
        results[(u, v)] = displacement / eps

    return results


# ---------------------------------------------------------------------------
# Fusion: Robust Rank Aggregation
# ---------------------------------------------------------------------------


def _normalise_scores(scores: dict) -> dict:
    """Min-max normalise to [0, 1]."""
    if not scores:
        return scores
    vals = list(scores.values())
    lo, hi = min(vals), max(vals)
    rng = hi - lo
    if rng < 1e-15:
        return dict.fromkeys(scores, 0.5)
    return {k: (v - lo) / rng for k, v in scores.items()}


def _rank_scores(scores: dict) -> dict:
    """Convert scores to ranks (1 = highest score)."""
    sorted_keys = sorted(scores, key=lambda k: scores[k], reverse=True)
    return {k: rank + 1 for rank, k in enumerate(sorted_keys)}


def _robust_rank_aggregation(
    method_scores: dict[str, dict],
    method_weights: dict[str, float],
    edges: list[tuple],
) -> dict[tuple, dict[str, Any]]:
    """Fuse multiple edge importance rankings via weighted RRA."""
    n_methods = len(method_scores)
    n_edges = len(edges)

    normalised = {
        name: _normalise_scores(scores) for name, scores in method_scores.items()
    }
    ranked = {name: _rank_scores(scores) for name, scores in method_scores.items()}

    results: dict[tuple, dict[str, Any]] = {}
    for edge in edges:
        norm_ranks = []
        per_method: dict[str, float] = {}
        for name, ranks in ranked.items():
            r = ranks.get(edge, n_edges)
            norm_r = r / n_edges
            norm_ranks.append((norm_r, method_weights.get(name, 1.0), name))
            per_method[name] = normalised[name].get(edge, 0)

        norm_ranks.sort(key=lambda x: x[0])

        # Weighted RRA using beta distribution CDF
        weighted_min_p = 1.0
        n_ranked = len(norm_ranks)
        for k, (r, w, _name) in enumerate(norm_ranks, 1):
            b_param = n_ranked - k + 1
            if b_param < 1:
                break
            p = stats.beta.cdf(r, k, b_param)
            weighted_p = p / w
            weighted_min_p = min(weighted_min_p, weighted_p)

        corrected_p = min(weighted_min_p * n_methods, 1.0)
        weight = -math.log(max(corrected_p, 1e-15))

        rank_values = [r for r, _, _ in norm_ranks]
        rank_variance = np.var(rank_values) if len(rank_values) > 1 else 0
        confidence = 1.0 / (1.0 + rank_variance * n_methods)

        results[edge] = {
            "raw_weight": weight,
            "confidence": round(float(confidence), 4),
            "method_scores": {n: round(v, 4) for n, v in per_method.items()},
        }

    # Normalise final weights to [0, 1] using rank-based normalisation.
    # Rank-based avoids a single outlier squashing all other edges to zero.
    raw_weights = {e: r["raw_weight"] for e, r in results.items()}
    if len(raw_weights) > 1:
        ranked_final = _rank_scores(raw_weights)
        n_e = len(ranked_final)
        # Map rank 1 (best) -> 1.0, rank n (worst) -> 1/n (never zero)
        for e in results:
            results[e]["weight"] = round((n_e - ranked_final[e] + 1) / n_e, 6)
    else:
        for e in results:
            results[e]["weight"] = 0.5

    return results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def refine_weights(
    graph: Graph,
    config: InferenceConfig | None = None,
) -> dict[str, Any]:
    """Run the 6-method weight inference pipeline on an Achilles Graph.

    Takes initial edge weights (priors from scoring.py) and refines them
    using topology-aware structural analysis. Updates edge weights in-place
    on the Graph object and rebuilds the adjacency matrix.

    Parameters
    ----------
    graph:
        A constructed Graph with prior weights already set on edges.
    config:
        Inference configuration. Uses defaults if not provided.

    Returns
    -------
    dict with graph-level resilience metrics and per-edge inference details.
    """
    if config is None:
        config = InferenceConfig()

    g = _to_networkx(graph)
    edge_list = list(g.edges())

    if len(edge_list) < 1 or g.number_of_nodes() < 2:
        logger.warning("Graph too small for weight inference — skipping")
        return {"skipped": True, "reason": "graph too small"}

    logger.info(
        "Running weight inference on %d nodes, %d edges",
        g.number_of_nodes(),
        g.number_of_edges(),
    )

    # Run all six methods
    logger.info("Method 1/6: Spectral sensitivity")
    spectral_scores = _spectral_edge_sensitivity(g, config)

    logger.info("Method 2/6: Information-theoretic")
    info_scores = _information_theoretic_weights(g, config)

    logger.info("Method 3/6: Probabilistic cascade")
    cascade_scores = _cascade_edge_importance(g, config)

    logger.info("Method 4/6: Percolation criticality")
    percolation_scores = _percolation_edge_criticality(g, config)

    logger.info("Method 5/6: GBB resilience")
    gbb_scores = _gbb_resilience_analysis(g, config)

    logger.info("Method 6/6: Perturbation response")
    perturbation_scores = _perturbation_sensitivity(g, config)

    # Fuse via RRA
    logger.info("Fusing via Robust Rank Aggregation")
    method_scores = {
        "spectral": spectral_scores,
        "info_theoretic": info_scores,
        "cascade": cascade_scores,
        "percolation": percolation_scores,
        "gbb": gbb_scores,
        "perturbation": perturbation_scores,
    }

    fused = _robust_rank_aggregation(method_scores, config.method_weights, edge_list)

    # Blend fused structural weights with priors and write back
    edge_lookup: dict[tuple[str, str], int] = {}
    for i, edge in enumerate(graph.edges):
        edge_lookup[(edge.from_id, edge.to_id)] = i

    pb = config.prior_blend
    for (u, v), data in fused.items():
        edge_idx = edge_lookup.get((u, v))
        if edge_idx is not None:
            edge = graph.edges[edge_idx]
            prior = edge.weight
            structural = data["weight"]
            blended = pb * prior + (1 - pb) * structural

            # Store provenance in meta
            provenance = {
                "prior_weight": prior,
                "structural_weight": structural,
                "inference_confidence": data["confidence"],
                "inference_method_scores": data["method_scores"],
            }
            if isinstance(edge.meta, dict):
                edge.meta.update(provenance)
            else:
                edge.meta = provenance
            # Clamp to (0, 1] — the graph validator requires weight > 0
            edge.weight = min(max(blended, 1e-6), 1.0)

    # Rebuild adjacency matrix with new weights
    graph.build_adjacency_matrix()

    logger.info("Weight inference complete")
    return {
        "skipped": False,
        "edges_refined": len(fused),
    }
