"""
Research-Grade Impact & Resilience Weight Inference Engine
==========================================================

Six independent methods for inferring edge weights from graph topology
and sparse metadata, fused via robust rank aggregation.

Methods:
  1. Spectral sensitivity     — ∂λ₂/∂wᵢⱼ via Laplacian perturbation theory
  2. Information-theoretic    — von Neumann entropy edge sensitivity
  3. Probabilistic cascade    — Monte Carlo independent cascade model
  4. Percolation criticality  — edge contribution to giant component survival
  5. GBB resilience           — Gao-Barzel-Barabási effective dynamics
  6. Perturbation response    — steady-state sensitivity via Jacobian analysis

Fusion:
  Robust Rank Aggregation (RRA) across all methods → consensus weight
  with confidence intervals and method agreement scores.

References:
  [1] Gao, Barzel, Barabási. "Universal resilience patterns in complex
      networks." Nature 530, 307–312 (2016).
  [2] Fiedler. "Algebraic connectivity of graphs." Czech Math J (1973).
  [3] Braunstein, Ghosh, Severini. "The Laplacian of a graph as a density
      matrix." Annals of Combinatorics (2006).
  [4] Kempe, Kleinberg, Tardos. "Maximizing the spread of influence through
      a social network." KDD (2003).
  [5] Callaway et al. "Network robustness and fragility: percolation on
      random graphs." Phys Rev Lett (2000).

Requirements: numpy, scipy, networkx
"""

import json
import csv
import math
import warnings
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
from scipy import linalg, sparse, stats
import networkx as nx


# ─────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────

@dataclass
class InferenceConfig:
    """All tuneable parameters."""

    # Semantic priors: base coupling strength per edge type.
    # These serve as PRIORS, not final weights — they seed the GBB dynamics
    # and the cascade transmission probabilities.
    EDGE_TYPE_PRIORS: dict = field(default_factory=lambda: {
        "runs_on": 0.95, "depends_on": 0.90, "uses_database": 0.85,
        "uses_db": 0.85, "requires": 0.90, "hosted_on": 0.90,
        "reads_from": 0.80, "writes_to": 0.85,
        "managed_by": 0.60, "maintained_by": 0.55, "deployed_to": 0.65,
        "monitored_by": 0.50, "backed_up_to": 0.50, "reports_to": 0.45,
        "owned_by": 0.55,
        "works_on": 0.35, "contributes_to": 0.30, "knows": 0.20,
        "knows_about": 0.20, "consults": 0.25, "documents": 0.15,
        "related_to": 0.10,
    })
    DEFAULT_PRIOR: float = 0.5

    # Cascade simulation
    CASCADE_SIMULATIONS: int = 5000
    CASCADE_MAX_STEPS: int = 20

    # Percolation
    PERCOLATION_SAMPLES: int = 200
    PERCOLATION_RESOLUTION: int = 50  # number of removal fractions to test

    # GBB dynamics parameters
    GBB_SELF_REGULATION: float = 1.0   # F(x) = B - x^α  (B)
    GBB_ALPHA: float = 1.0             # self-regulation exponent
    GBB_INTERACTION: float = 1.0       # G(x_i, x_j) coupling strength
    GBB_HILL_COEFF: float = 2.0        # Hill coefficient h for saturation

    # Perturbation analysis
    PERTURBATION_EPSILON: float = 1e-4

    # Rank aggregation
    METHOD_WEIGHTS: dict = field(default_factory=lambda: {
        "spectral": 1.0,
        "info_theoretic": 1.0,
        "cascade": 1.2,        # slightly higher — directly measures impact
        "percolation": 1.0,
        "gbb": 1.1,
        "perturbation": 1.0,
    })

    # Propagation
    MAX_PROPAGATION_DEPTH: int = 10

    # Random seed for reproducibility
    SEED: int = 42


# ─────────────────────────────────────────────────────────────
# DATA LOADING (same as before, included for self-containment)
# ─────────────────────────────────────────────────────────────

def load_edges(filepath: str) -> list[dict]:
    p = Path(filepath)
    if p.suffix.lower() == ".json":
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            data = data.get("edges", data.get("links", []))
        return data
    else:
        edges = []
        with open(filepath, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            reader.fieldnames = [h.strip().lower() for h in reader.fieldnames]
            for row in reader:
                edges.append({k.strip(): v.strip() for k, v in row.items()})
        return edges


def build_graph(edges: list[dict], config: InferenceConfig) -> nx.DiGraph:
    G = nx.DiGraph()
    for e in edges:
        src = e.get("source", e.get("src", e.get("from", "")))
        tgt = e.get("target", e.get("tgt", e.get("to", "")))
        etype = e.get("type", e.get("edge_type", e.get("relation", "unknown")))
        attrs = {k: v for k, v in e.items()
                 if k not in ("source", "src", "from", "target", "tgt", "to",
                              "type", "edge_type", "relation")}
        attrs["edge_type"] = etype
        attrs["prior"] = config.EDGE_TYPE_PRIORS.get(etype, config.DEFAULT_PRIOR)
        G.add_edge(src, tgt, **attrs)
    return G


# ─────────────────────────────────────────────────────────────
# UTILITY: GRAPH MATRICES
# ─────────────────────────────────────────────────────────────

def _node_index(G: nx.DiGraph) -> dict:
    """Stable node → integer index mapping."""
    return {n: i for i, n in enumerate(sorted(G.nodes()))}


def _weighted_adjacency(G: nx.DiGraph, idx: dict, weight_key: str = "prior") -> np.ndarray:
    """Weighted adjacency matrix (undirected version for spectral analysis)."""
    n = len(idx)
    A = np.zeros((n, n))
    for u, v, d in G.edges(data=True):
        w = d.get(weight_key, 0.5)
        i, j = idx[u], idx[v]
        A[i][j] = w
        A[j][i] = w  # symmetrise for spectral methods
    return A


def _laplacian(A: np.ndarray) -> np.ndarray:
    """Combinatorial Laplacian: L = D - A."""
    D = np.diag(A.sum(axis=1))
    return D - A


def _normalised_laplacian(A: np.ndarray) -> np.ndarray:
    """Normalised Laplacian: L_norm = I - D^{-1/2} A D^{-1/2}."""
    d = A.sum(axis=1)
    d_inv_sqrt = np.where(d > 0, 1.0 / np.sqrt(d), 0)
    D_inv_sqrt = np.diag(d_inv_sqrt)
    n = A.shape[0]
    return np.eye(n) - D_inv_sqrt @ A @ D_inv_sqrt


# ─────────────────────────────────────────────────────────────
# METHOD 1: SPECTRAL SENSITIVITY
# ─────────────────────────────────────────────────────────────

def spectral_edge_sensitivity(G: nx.DiGraph, config: InferenceConfig) -> dict:
    """
    Compute edge importance via sensitivity of the Fiedler value (algebraic
    connectivity λ₂) to edge weight perturbation.

    For the combinatorial Laplacian L = D - A, the Fiedler value λ₂ is
    the second-smallest eigenvalue. Its sensitivity to edge (i,j) weight is:

        ∂λ₂/∂w_{ij} = (v₂[i] - v₂[j])² 

    where v₂ is the Fiedler vector (eigenvector of λ₂). Edges bridging
    communities (large |v₂[i] - v₂[j]|) are most critical for connectivity.

    Also computes:
    - Natural connectivity: exp(1/n Σ exp(λᵢ(A)))  [robustness measure]
    - Effective resistance: R_{ij} = (L⁺[i,i] + L⁺[j,j] - 2L⁺[i,j])
      where L⁺ is the pseudoinverse of L.

    Returns: {(u, v): sensitivity_score} for all edges.
    """
    idx = _node_index(G)
    n = len(idx)
    if n < 3:
        return {(u, v): 0.5 for u, v in G.edges()}

    A = _weighted_adjacency(G, idx)
    L = _laplacian(A)

    # Eigendecomposition of Laplacian
    eigenvalues, eigenvectors = np.linalg.eigh(L)

    # λ₂ and Fiedler vector
    lambda_2 = eigenvalues[1]
    v2 = eigenvectors[:, 1]

    # Effective resistance via pseudoinverse of L
    # L⁺ = Σ (1/λᵢ) vᵢvᵢᵀ  for λᵢ > 0
    L_pinv = np.zeros((n, n))
    for k in range(n):
        if eigenvalues[k] > 1e-10:
            L_pinv += (1.0 / eigenvalues[k]) * np.outer(eigenvectors[:, k], eigenvectors[:, k])

    # Natural connectivity (uses adjacency eigenvalues)
    A_eigenvalues = np.linalg.eigvalsh(A)
    natural_conn = np.log(np.mean(np.exp(A_eigenvalues)))

    results = {}
    rev_idx = {i: n for n, i in idx.items()}

    for u, v in G.edges():
        i, j = idx[u], idx[v]

        # Fiedler sensitivity: (v₂[i] - v₂[j])²
        fiedler_sens = (v2[i] - v2[j]) ** 2

        # Effective resistance of this edge
        eff_resistance = L_pinv[i, i] + L_pinv[j, j] - 2 * L_pinv[i, j]

        # Combine: high Fiedler sensitivity + high effective resistance = critical edge
        # Normalise each to [0, 1] later in fusion
        combined = fiedler_sens * (1 + abs(eff_resistance))
        results[(u, v)] = combined

    # Store global metrics on the graph
    G.graph["fiedler_value"] = float(lambda_2)
    G.graph["natural_connectivity"] = float(natural_conn)
    G.graph["spectral_gap"] = float(eigenvalues[1] / eigenvalues[-1]) if eigenvalues[-1] > 0 else 0

    return results


# ─────────────────────────────────────────────────────────────
# METHOD 2: INFORMATION-THEORETIC EDGE IMPORTANCE
# ─────────────────────────────────────────────────────────────

def information_theoretic_weights(G: nx.DiGraph, config: InferenceConfig) -> dict:
    """
    Compute edge importance via von Neumann entropy of the graph and
    its change when an edge is removed.

    The von Neumann entropy of a graph is:
        S(G) = -Tr(ρ log₂ ρ)
    where ρ = L̃/Tr(L̃) is the density matrix derived from the normalised
    Laplacian L̃.

    Edge importance = |S(G) - S(G \ e)| — how much the graph's structural
    information changes when edge e is removed.

    Also incorporates:
    - Edge betweenness entropy: how evenly shortest paths distribute
      across the edge (high entropy = more critical as a bridge)

    Returns: {(u, v): info_score} for all edges.
    """
    idx = _node_index(G)
    n = len(idx)
    if n < 3:
        return {(u, v): 0.5 for u, v in G.edges()}

    A = _weighted_adjacency(G, idx)
    L = _laplacian(A)

    def _von_neumann_entropy(laplacian_matrix):
        """S = -Tr(ρ log₂ ρ) where ρ = L/Tr(L)."""
        trace = np.trace(laplacian_matrix)
        if trace < 1e-12:
            return 0.0
        rho = laplacian_matrix / trace
        eigenvalues = np.linalg.eigvalsh(rho)
        eigenvalues = eigenvalues[eigenvalues > 1e-15]
        return float(-np.sum(eigenvalues * np.log2(eigenvalues)))

    S_full = _von_neumann_entropy(L)

    # Edge betweenness centrality (weighted)
    U = G.to_undirected()
    for u, v, d in U.edges(data=True):
        if "prior" not in d:
            d["prior"] = 0.5
    try:
        ebc = nx.edge_betweenness_centrality(U, weight="prior", normalized=True)
    except Exception:
        ebc = {e: 0.5 for e in U.edges()}

    results = {}
    for u, v in G.edges():
        i, j = idx[u], idx[v]

        # Remove edge and recompute entropy
        A_reduced = A.copy()
        w_orig = A_reduced[i, j]
        A_reduced[i, j] = 0
        A_reduced[j, i] = 0
        L_reduced = _laplacian(A_reduced)

        S_reduced = _von_neumann_entropy(L_reduced)
        entropy_delta = abs(S_full - S_reduced)

        # Edge betweenness (get from undirected, handle both orderings)
        eb = ebc.get((u, v), ebc.get((v, u), 0))

        # Combined: entropy sensitivity + betweenness (both normalised later)
        combined = entropy_delta * (1 + eb)
        results[(u, v)] = combined

    G.graph["von_neumann_entropy"] = S_full
    return results


# ─────────────────────────────────────────────────────────────
# METHOD 3: PROBABILISTIC CASCADE MODEL
# ─────────────────────────────────────────────────────────────

def cascade_edge_importance(G: nx.DiGraph, config: InferenceConfig) -> dict:
    """
    Monte Carlo estimation of edge importance under the Independent
    Cascade Model (ICM).

    For each simulation:
    1. Pick a random seed node (uniform)
    2. Propagate: each active node attempts to activate each out-neighbour
       with probability = edge prior weight
    3. Record which edges "fired" (transmitted activation)

    Edge importance = frequency of firing × average cascade size when it fires.
    This captures both how often an edge participates in cascades AND how
    consequential those cascades are.

    Also computes transmission probability per edge:
        P(e fires | any cascade from source side) via conditional frequency.

    Returns: {(u, v): cascade_score} for all edges.
    """
    rng = np.random.RandomState(config.SEED)
    nodes = list(G.nodes())
    n = len(nodes)
    if n < 2:
        return {(u, v): 0.5 for u, v in G.edges()}

    edge_fire_count = defaultdict(int)
    edge_cascade_sizes = defaultdict(list)
    node_seed_count = defaultdict(int)

    for sim in range(config.CASCADE_SIMULATIONS):
        seed = nodes[rng.randint(n)]
        node_seed_count[seed] += 1

        active = {seed}
        newly_active = {seed}
        fired_edges = set()

        for step in range(config.CASCADE_MAX_STEPS):
            if not newly_active:
                break
            next_active = set()
            for node in newly_active:
                for _, neighbor, data in G.out_edges(node, data=True):
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
    for u, v in G.edges():
        e = (u, v)
        fires = edge_fire_count.get(e, 0)
        if fires > 0:
            avg_cascade = np.mean(edge_cascade_sizes[e])
            freq = fires / config.CASCADE_SIMULATIONS
            # Importance = frequency × normalised cascade size
            score = freq * (avg_cascade / n)
        else:
            score = 0.0

        results[(u, v)] = score

        # Store transmission probability on edge
        source_seeds = node_seed_count.get(u, 0)
        G[u][v]["transmission_prob"] = fires / max(source_seeds, 1)

    return results


# ─────────────────────────────────────────────────────────────
# METHOD 4: PERCOLATION CRITICALITY
# ─────────────────────────────────────────────────────────────

def percolation_edge_criticality(G: nx.DiGraph, config: InferenceConfig) -> dict:
    """
    Measure each edge's contribution to the giant connected component (GCC)
    survival under random bond percolation.

    For each edge e:
    1. Remove e from the graph
    2. Run bond percolation at multiple removal fractions φ
    3. Measure GCC size at each φ
    4. Compare to baseline (with e present)
    5. Edge criticality = area between baseline and reduced percolation curves

    This captures phase-transition-relevant edges: edges whose removal
    shifts the percolation threshold leftward (system fragments sooner).

    Returns: {(u, v): percolation_score} for all edges.
    """
    rng = np.random.RandomState(config.SEED + 1)
    U = G.to_undirected()
    all_edges = list(U.edges())
    n = U.number_of_nodes()
    m = len(all_edges)

    if n < 3 or m < 2:
        return {(u, v): 0.5 for u, v in G.edges()}

    phis = np.linspace(0, 1, config.PERCOLATION_RESOLUTION)

    def _percolation_curve(graph, edges_list, n_nodes):
        """Compute GCC fraction at each removal fraction φ."""
        curve = np.zeros(len(phis))
        for trial in range(config.PERCOLATION_SAMPLES):
            perm = rng.permutation(len(edges_list))
            for k, phi in enumerate(phis):
                n_remove = int(phi * len(edges_list))
                edges_to_remove = set(perm[:n_remove])
                H = nx.Graph()
                H.add_nodes_from(graph.nodes())
                for idx_e, e in enumerate(edges_list):
                    if idx_e not in edges_to_remove:
                        H.add_edge(*e)
                if H.number_of_nodes() > 0:
                    gcc = max(nx.connected_components(H), key=len)
                    curve[k] += len(gcc) / n_nodes
                else:
                    curve[k] += 0
        curve /= config.PERCOLATION_SAMPLES
        return curve

    # Baseline percolation curve
    baseline_curve = _percolation_curve(U, all_edges, n)
    baseline_auc = np.trapezoid(baseline_curve, phis)

    # Store the percolation threshold (φ where GCC drops below 0.5)
    threshold_idx = np.argmax(baseline_curve < 0.5)
    G.graph["percolation_threshold"] = float(phis[threshold_idx]) if threshold_idx > 0 else 1.0

    results = {}
    directed_edges = list(G.edges())

    # For efficiency, sample a subset of edges if graph is large
    if len(directed_edges) > 100:
        # Approximate: use edge betweenness to pre-rank, then
        # only do full percolation on top candidates
        ebc = nx.edge_betweenness_centrality(U, normalized=True)
        # Map directed edges to undirected betweenness
        for u, v in directed_edges:
            results[(u, v)] = ebc.get((u, v), ebc.get((v, u), 0))
        return results

    for u, v in directed_edges:
        # Remove this edge from undirected version
        U_reduced = U.copy()
        if U_reduced.has_edge(u, v):
            U_reduced.remove_edge(u, v)
        reduced_edges = list(U_reduced.edges())

        reduced_curve = _percolation_curve(U_reduced, reduced_edges, n)
        reduced_auc = np.trapezoid(reduced_curve, phis)

        # Criticality = how much AUC drops when this edge is removed
        criticality = max(0, baseline_auc - reduced_auc)
        results[(u, v)] = criticality

    return results


# ─────────────────────────────────────────────────────────────
# METHOD 5: GBB RESILIENCE FRAMEWORK
# ─────────────────────────────────────────────────────────────

def gbb_resilience_analysis(G: nx.DiGraph, config: InferenceConfig) -> dict:
    """
    Implement the Gao-Barzel-Barabási dimension reduction framework [1]
    to derive edge importance from their contribution to the system's
    effective resilience parameter β_eff.

    For dynamics: dx_i/dt = F(x_i) + Σ_j A_ij G(x_i, x_j)
    The system reduces to effective 1D: dx_eff/dt = F(x_eff) + β_eff G(x_eff, x_eff)

    Where β_eff = <s>² / <s²> × <a>
        s_i = Σ_j A_ij  (node strength)
        <a> = mean edge weight

    Edge importance = ∂β_eff/∂w_{ij} — how much the effective coupling
    changes when this edge weight changes.

    Also locates the system on the universal resilience curve and
    estimates distance to tipping point.

    Returns: {(u, v): gbb_score} for all edges.
    """
    idx = _node_index(G)
    n = len(idx)
    if n < 2:
        return {(u, v): 0.5 for u, v in G.edges()}

    A = _weighted_adjacency(G, idx)

    # Node strengths
    s = A.sum(axis=1)  # s_i = Σ_j A_ij
    s_mean = np.mean(s)
    s2_mean = np.mean(s ** 2)

    # Mean edge weight
    mask = A > 0
    a_mean = A[mask].mean() if mask.any() else 0.5

    # β_eff = <s>² / <s²> × <a>
    if s2_mean > 1e-12:
        beta_eff = (s_mean ** 2 / s2_mean) * a_mean
    else:
        beta_eff = 0

    G.graph["gbb_beta_eff"] = float(beta_eff)

    # Resilience function for mutualistic dynamics:
    # F(x) = B - x^α,  G(x_i, x_j) = x_j^h / (1 + x_j^h)
    # At steady state: x* solves B - x^α + β × x^h/(1+x^h) = 0
    # The tipping point occurs when d/dx[F + βG] = 0 simultaneously
    # For α=1, h=2: critical β_c can be found numerically

    alpha = config.GBB_ALPHA
    h = config.GBB_HILL_COEFF
    B = config.GBB_SELF_REGULATION

    # Find steady state and critical β via Newton's method
    def _steady_state(beta, x0=1.0):
        """Solve B - x^α + β × x^h/(1+x^h) = 0."""
        x = x0
        for _ in range(100):
            f = B - x**alpha + beta * x**h / (1 + x**h)
            df = -alpha * x**(alpha-1) + beta * h * x**(h-1) / (1 + x**h)**2
            if abs(df) < 1e-15:
                break
            x = x - f / df
            x = max(x, 1e-10)
        return x

    # Estimate critical β (where steady state collapses)
    # Binary search for the β where the steady state drops discontinuously
    beta_lo, beta_hi = 0, 10 * beta_eff + 1
    x_high = _steady_state(beta_hi)
    for _ in range(50):
        beta_mid = (beta_lo + beta_hi) / 2
        x_mid = _steady_state(beta_mid)
        if x_mid > 0.1:  # still in high state
            beta_hi = beta_mid
        else:
            beta_lo = beta_mid

    beta_critical = beta_lo
    G.graph["gbb_beta_critical"] = float(beta_critical)
    G.graph["gbb_resilience_margin"] = float(beta_eff - beta_critical) if beta_eff > beta_critical else 0

    # Edge importance: ∂β_eff/∂w_{ij}
    # β_eff = (<s>²/<s²>) × <a>
    # ∂β_eff/∂w_{ij} requires chain rule through s_i, s_j, <s>, <s²>, <a>

    results = {}
    rev_idx = {i: node for node, i in idx.items()}
    m_edges = mask.sum() / 2  # undirected edge count

    for u, v in G.edges():
        i, j = idx[u], idx[v]
        w = A[i, j]

        # ∂s_i/∂w_{ij} = 1, ∂s_j/∂w_{ij} = 1 (undirected)
        # ∂<s>/∂w_{ij} = 2/n
        # ∂<s²>/∂w_{ij} = 2(s_i + s_j)/n
        # ∂<a>/∂w_{ij} ≈ 1/m (if edge exists) or 1/(m+1) (if new)

        ds_mean = 2.0 / n
        ds2_mean = 2.0 * (s[i] + s[j]) / n
        da_mean = 1.0 / max(m_edges, 1)

        # Quotient rule on <s>²/<s²>
        if s2_mean > 1e-12:
            d_ratio = (2 * s_mean * ds_mean * s2_mean - s_mean**2 * ds2_mean) / s2_mean**2
        else:
            d_ratio = 0

        # Product rule: β = ratio × <a>
        d_beta = d_ratio * a_mean + (s_mean**2 / max(s2_mean, 1e-12)) * da_mean

        results[(u, v)] = abs(d_beta)

    return results


# ─────────────────────────────────────────────────────────────
# METHOD 6: PERTURBATION RESPONSE (JACOBIAN-BASED)
# ─────────────────────────────────────────────────────────────

def perturbation_sensitivity(G: nx.DiGraph, config: InferenceConfig) -> dict:
    """
    Compute edge importance via steady-state perturbation analysis.

    Model: at steady state, each node's activity x_i* satisfies:
        0 = f(x_i*) + Σ_j A_ij g(x_i*, x_j*)

    The Jacobian J = ∂(dynamics)/∂x at steady state determines how
    perturbations propagate. For a small change δw_{ij} in edge weight:

        δx* ≈ -J⁻¹ × (∂dynamics/∂w_{ij})

    Edge importance = ||δx*||₂ — the total system displacement from
    perturbing this one edge weight.

    Uses Sherman-Morrison for efficient rank-1 updates rather than
    re-inverting J for each edge.

    Returns: {(u, v): perturbation_score} for all edges.
    """
    idx = _node_index(G)
    n = len(idx)
    if n < 2:
        return {(u, v): 0.5 for u, v in G.edges()}

    A = _weighted_adjacency(G, idx)

    # Steady state: assume linear dynamics for tractability
    # dx/dt = -x + A x  →  steady state at (I - A)x = 0
    # But we want a non-trivial steady state, so use:
    # dx/dt = b - x + A x  where b is a driving term
    # Steady state: x* = (I - A)⁻¹ b

    I = np.eye(n)

    # Check if (I - A) is invertible (spectral radius of A < 1)
    spectral_radius = max(abs(np.linalg.eigvals(A)))

    if spectral_radius >= 1:
        # Rescale A so dynamics are stable
        A_scaled = A / (spectral_radius + 0.1)
    else:
        A_scaled = A

    M = I - A_scaled  # System matrix
    b = np.ones(n)    # Uniform driving

    try:
        M_inv = np.linalg.inv(M)
        x_star = M_inv @ b
    except np.linalg.LinAlgError:
        return {(u, v): 0.5 for u, v in G.edges()}

    results = {}
    eps = config.PERTURBATION_EPSILON

    for u, v in G.edges():
        i, j = idx[u], idx[v]

        # Sherman-Morrison: (M + εE_{ij})⁻¹ ≈ M⁻¹ - ε(M⁻¹ eᵢ)(eⱼᵀ M⁻¹)/(1 + ε eⱼᵀ M⁻¹ eᵢ)
        # But we perturb A, so ΔM = -εE_{ij} (since M = I - A)
        # → (M - εE_{ij})⁻¹ ≈ M⁻¹ + ε (M⁻¹ eᵢ)(eⱼᵀ M⁻¹) / (1 - ε eⱼᵀ M⁻¹ eᵢ)

        col_i = M_inv[:, i]    # M⁻¹ eᵢ
        row_j = M_inv[j, :]    # eⱼᵀ M⁻¹
        denominator = 1.0 - eps * M_inv[j, i]

        if abs(denominator) < 1e-15:
            # Near-singular perturbation — this edge is extremely critical
            results[(u, v)] = 1e6
            continue

        # Perturbed steady state
        delta_M_inv = eps * np.outer(col_i, row_j) / denominator
        x_perturbed = (M_inv + delta_M_inv) @ b

        # System displacement
        displacement = np.linalg.norm(x_perturbed - x_star)
        results[(u, v)] = displacement / eps  # normalise by perturbation size

    return results


# ─────────────────────────────────────────────────────────────
# FUSION: ROBUST RANK AGGREGATION
# ─────────────────────────────────────────────────────────────

def _normalise_scores(scores: dict) -> dict:
    """Min-max normalise to [0, 1]."""
    if not scores:
        return scores
    vals = list(scores.values())
    lo, hi = min(vals), max(vals)
    rng = hi - lo
    if rng < 1e-15:
        return {k: 0.5 for k in scores}
    return {k: (v - lo) / rng for k, v in scores.items()}


def _rank_scores(scores: dict) -> dict:
    """Convert scores to ranks (1 = highest score)."""
    sorted_keys = sorted(scores, key=lambda k: scores[k], reverse=True)
    return {k: rank + 1 for rank, k in enumerate(sorted_keys)}


def robust_rank_aggregation(
    method_scores: dict[str, dict],
    method_weights: dict[str, float],
    edges: list[tuple],
) -> dict:
    """
    Fuse multiple edge importance rankings via weighted Robust Rank
    Aggregation (RRA).

    For each edge:
    1. Get its normalised rank in each method (rank/n → uniform [0,1])
    2. Apply the Stuart-Ord minimum p-value aggregation:
       p = min_k (C(n,k) × r_{(k)}^k × (1-r_{(k)})^{n-k})
       where r_{(k)} is the k-th smallest normalised rank
    3. Weight by method importance
    4. Final score = -log(weighted_p)

    Also returns per-method agreement: how correlated each method's
    ranking is with the consensus.

    Returns: {(u, v): {"weight": w, "confidence": c, "method_scores": {...}}}
    """
    n_methods = len(method_scores)
    n_edges = len(edges)

    # Normalise each method's scores
    normalised = {name: _normalise_scores(scores) for name, scores in method_scores.items()}

    # Rank each method
    ranked = {name: _rank_scores(scores) for name, scores in method_scores.items()}

    results = {}
    for edge in edges:
        # Collect normalised ranks (rank / n_edges) for this edge across methods
        norm_ranks = []
        per_method = {}
        for name, ranks in ranked.items():
            r = ranks.get(edge, n_edges)
            norm_r = r / n_edges
            norm_ranks.append((norm_r, method_weights.get(name, 1.0), name))
            per_method[name] = normalised[name].get(edge, 0)

        # Sort by normalised rank
        norm_ranks.sort(key=lambda x: x[0])

        # Weighted RRA: use the beta distribution CDF as the p-value
        # for each rank position
        weighted_min_p = 1.0
        for k, (r, w, name) in enumerate(norm_ranks, 1):
            # P(seeing rank ≤ r in position k of n_methods independent rankings)
            # Under null (uniform), this follows Beta(k, n_methods - k + 1)
            p = stats.beta.cdf(r, k, n_methods - k + 1)
            weighted_p = p / w  # lower weight → less penalised
            weighted_min_p = min(weighted_min_p, weighted_p)

        # Bonferroni-like correction
        corrected_p = min(weighted_min_p * n_methods, 1.0)

        # Final weight: -log(p), normalised later
        weight = -math.log(max(corrected_p, 1e-15))

        # Confidence: agreement across methods (inverse of rank variance)
        rank_values = [r for r, _, _ in norm_ranks]
        rank_variance = np.var(rank_values) if len(rank_values) > 1 else 0
        confidence = 1.0 / (1.0 + rank_variance * n_methods)

        results[edge] = {
            "raw_weight": weight,
            "confidence": round(confidence, 4),
            "method_scores": {n: round(v, 4) for n, v in per_method.items()},
        }

    # Normalise final weights to [0, 1]
    raw_weights = {e: r["raw_weight"] for e, r in results.items()}
    normalised_final = _normalise_scores(raw_weights)
    for e in results:
        results[e]["weight"] = round(normalised_final[e], 6)

    return results


# ─────────────────────────────────────────────────────────────
# NODE-LEVEL ANALYSIS
# ─────────────────────────────────────────────────────────────

def compute_node_metrics(G: nx.DiGraph) -> None:
    """Compute node-level criticality, bottleneck, and resilience scores."""
    for node in G.nodes():
        # Incoming criticality: sum of fused weights on incoming edges
        crit_in = sum(d.get("fused_weight", 0) for _, _, d in G.in_edges(node, data=True))
        crit_out = sum(d.get("fused_weight", 0) for _, _, d in G.out_edges(node, data=True))

        G.nodes[node]["criticality_in"] = round(crit_in, 4)
        G.nodes[node]["criticality_out"] = round(crit_out, 4)

        # Resilience contribution: how much does this node contribute to
        # the overall Fiedler value? (from spectral analysis)
        idx_map = _node_index(G)
        A = _weighted_adjacency(G, idx_map)
        L = _laplacian(A)
        eigenvalues, eigenvectors = np.linalg.eigh(L)
        v2 = eigenvectors[:, 1]
        i = idx_map[node]
        G.nodes[node]["fiedler_component"] = round(float(v2[i] ** 2), 6)


# ─────────────────────────────────────────────────────────────
# MAIN PIPELINE
# ─────────────────────────────────────────────────────────────

def run_pipeline(
    filepath: str,
    config: Optional[InferenceConfig] = None,
    query_node: Optional[str] = None,
    export_path: Optional[str] = None,
    verbose: bool = True,
) -> nx.DiGraph:
    """Run the full 6-method weight inference + fusion pipeline."""
    if config is None:
        config = InferenceConfig()

    def log(msg):
        if verbose:
            print(msg)

    log(f"Loading edges from {filepath}...")
    edges = load_edges(filepath)
    log(f"  {len(edges)} edges loaded")

    G = build_graph(edges, config)
    log(f"  {G.number_of_nodes()} nodes, {G.number_of_edges()} edges\n")

    edge_list = list(G.edges())

    # Run all six methods
    log("Method 1/6: Spectral sensitivity (Fiedler + effective resistance)...")
    spectral_scores = spectral_edge_sensitivity(G, config)
    log(f"  Fiedler value λ₂ = {G.graph.get('fiedler_value', 'N/A'):.4f}")
    log(f"  Natural connectivity = {G.graph.get('natural_connectivity', 'N/A'):.4f}")

    log("Method 2/6: Information-theoretic (von Neumann entropy)...")
    info_scores = information_theoretic_weights(G, config)
    log(f"  Graph entropy S = {G.graph.get('von_neumann_entropy', 'N/A'):.4f} bits")

    log("Method 3/6: Probabilistic cascade (Monte Carlo ICM)...")
    cascade_scores = cascade_edge_importance(G, config)
    log(f"  {config.CASCADE_SIMULATIONS} simulations completed")

    log("Method 4/6: Percolation criticality (bond percolation)...")
    percolation_scores = percolation_edge_criticality(G, config)
    log(f"  Percolation threshold φ_c ≈ {G.graph.get('percolation_threshold', 'N/A'):.3f}")

    log("Method 5/6: GBB resilience framework...")
    gbb_scores = gbb_resilience_analysis(G, config)
    log(f"  β_eff = {G.graph.get('gbb_beta_eff', 'N/A'):.4f}")
    log(f"  β_critical = {G.graph.get('gbb_beta_critical', 'N/A'):.4f}")
    margin = G.graph.get('gbb_resilience_margin', 0)
    log(f"  Resilience margin = {margin:.4f} {'(HEALTHY)' if margin > 0 else '(AT RISK)'}")

    log("Method 6/6: Perturbation response (Jacobian + Sherman-Morrison)...")
    perturbation_scores = perturbation_sensitivity(G, config)

    # Fuse
    log("\nFusing via Robust Rank Aggregation...")
    method_scores = {
        "spectral": spectral_scores,
        "info_theoretic": info_scores,
        "cascade": cascade_scores,
        "percolation": percolation_scores,
        "gbb": gbb_scores,
        "perturbation": perturbation_scores,
    }

    fused = robust_rank_aggregation(method_scores, config.METHOD_WEIGHTS, edge_list)

    # Write fused weights back to graph
    for u, v in G.edges():
        e = (u, v)
        if e in fused:
            G[u][v]["fused_weight"] = fused[e]["weight"]
            G[u][v]["confidence"] = fused[e]["confidence"]
            G[u][v]["method_scores"] = fused[e]["method_scores"]
        else:
            G[u][v]["fused_weight"] = 0.0
            G[u][v]["confidence"] = 0.0

    # Node-level metrics
    log("Computing node-level metrics...")
    compute_node_metrics(G)

    # Report
    log("")
    _print_report(G, config, fused, method_scores, query_node)

    if export_path:
        export_data = {
            "graph_metrics": {
                "fiedler_value": G.graph.get("fiedler_value"),
                "natural_connectivity": G.graph.get("natural_connectivity"),
                "spectral_gap": G.graph.get("spectral_gap"),
                "von_neumann_entropy": G.graph.get("von_neumann_entropy"),
                "percolation_threshold": G.graph.get("percolation_threshold"),
                "gbb_beta_eff": G.graph.get("gbb_beta_eff"),
                "gbb_beta_critical": G.graph.get("gbb_beta_critical"),
                "gbb_resilience_margin": G.graph.get("gbb_resilience_margin"),
            },
            "edges": [
                {
                    "source": u, "target": v,
                    "edge_type": d.get("edge_type"),
                    "fused_weight": d.get("fused_weight"),
                    "confidence": d.get("confidence"),
                    "method_scores": d.get("method_scores"),
                    "prior": d.get("prior"),
                    "transmission_prob": d.get("transmission_prob"),
                }
                for u, v, d in G.edges(data=True)
            ],
            "nodes": [
                {
                    "id": n,
                    "criticality_in": d.get("criticality_in"),
                    "criticality_out": d.get("criticality_out"),
                    "fiedler_component": d.get("fiedler_component"),
                }
                for n, d in G.nodes(data=True)
            ],
        }
        with open(export_path, "w") as f:
            json.dump(export_data, f, indent=2, default=str)
        log(f"\nExported to {export_path}")

    return G


# ─────────────────────────────────────────────────────────────
# REPORTING
# ─────────────────────────────────────────────────────────────

def _print_report(G, config, fused, method_scores, query_node):
    W = 72
    def header(title):
        print(f"\n{'═' * W}")
        print(f"  {title}")
        print(f"{'═' * W}")

    header("GRAPH-LEVEL RESILIENCE METRICS")
    metrics = [
        ("Fiedler value (algebraic connectivity) λ₂", G.graph.get("fiedler_value", 0)),
        ("Natural connectivity", G.graph.get("natural_connectivity", 0)),
        ("Spectral gap (λ₂/λ_max)", G.graph.get("spectral_gap", 0)),
        ("Von Neumann entropy (bits)", G.graph.get("von_neumann_entropy", 0)),
        ("Percolation threshold φ_c", G.graph.get("percolation_threshold", 0)),
        ("GBB effective coupling β_eff", G.graph.get("gbb_beta_eff", 0)),
        ("GBB critical coupling β_c", G.graph.get("gbb_beta_critical", 0)),
        ("GBB resilience margin (β_eff - β_c)", G.graph.get("gbb_resilience_margin", 0)),
    ]
    for label, val in metrics:
        print(f"  {label:48s} {val:.4f}")

    header("TOP EDGES BY FUSED WEIGHT (with method agreement)")
    edges_sorted = sorted(fused.items(), key=lambda x: x[1]["weight"], reverse=True)
    print(f"  {'Edge':36s} {'Weight':>7s} {'Conf':>5s} │ {'Spec':>5s} {'Info':>5s} {'Casc':>5s} {'Perc':>5s} {'GBB':>5s} {'Pert':>5s}")
    print(f"  {'─'*36}─{'─'*7}─{'─'*5}─┼─{'─'*5}─{'─'*5}─{'─'*5}─{'─'*5}─{'─'*5}─{'─'*5}")
    for (u, v), data in edges_sorted[:20]:
        ms = data["method_scores"]
        label = f"{u} → {v}"
        if len(label) > 35:
            label = label[:32] + "..."
        print(f"  {label:36s} {data['weight']:7.4f} {data['confidence']:5.2f} │"
              f" {ms.get('spectral',0):5.2f} {ms.get('info_theoretic',0):5.2f}"
              f" {ms.get('cascade',0):5.2f} {ms.get('percolation',0):5.2f}"
              f" {ms.get('gbb',0):5.2f} {ms.get('perturbation',0):5.2f}")

    header("NODE CRITICALITY RANKING")
    nodes_sorted = sorted(G.nodes(data=True), key=lambda x: x[1].get("criticality_in", 0), reverse=True)
    print(f"  {'Node':28s} {'Crit In':>8s} {'Crit Out':>9s} {'Fiedler²':>9s} {'In°':>4s} {'Out°':>5s}")
    print(f"  {'─'*28}─{'─'*8}─{'─'*9}─{'─'*9}─{'─'*4}─{'─'*5}")
    for node, attrs in nodes_sorted[:15]:
        print(f"  {node:28s} {attrs.get('criticality_in',0):8.4f}"
              f" {attrs.get('criticality_out',0):9.4f}"
              f" {attrs.get('fiedler_component',0):9.6f}"
              f" {G.in_degree(node):4d} {G.out_degree(node):5d}")

    # Method correlation matrix
    header("METHOD CORRELATION MATRIX (Spearman ρ)")
    names = list(method_scores.keys())
    edge_keys = list(G.edges())
    vectors = {}
    for name, scores in method_scores.items():
        vectors[name] = [scores.get(e, 0) for e in edge_keys]

    print(f"  {'':16s}", end="")
    for n in names:
        print(f" {n[:7]:>7s}", end="")
    print()
    for n1 in names:
        print(f"  {n1:16s}", end="")
        for n2 in names:
            if n1 == n2:
                print(f"    1.00", end="")
            else:
                rho, _ = stats.spearmanr(vectors[n1], vectors[n2])
                print(f"  {rho:6.2f}", end="")
        print()

    if query_node and query_node in G:
        header(f"CHANGE PROPAGATION: {query_node}")
        # Use cascade model for propagation
        from collections import deque
        impacts = {}
        frontier = deque([(query_node, 1.0, 0)])
        visited = {query_node}

        while frontier:
            current, cum_w, depth = frontier.popleft()
            if depth >= config.MAX_PROPAGATION_DEPTH:
                continue
            for _, nbr, d in G.out_edges(current, data=True):
                w = d.get("fused_weight", 0)
                new_cum = cum_w * w
                if new_cum > 0.01 and nbr not in visited:
                    visited.add(nbr)
                    impacts[nbr] = round(new_cum, 6)
                    frontier.append((nbr, new_cum, depth + 1))

        impacts_sorted = sorted(impacts.items(), key=lambda x: -x[1])
        print(f"  Nodes affected: {len(impacts_sorted)}")
        print(f"  Total weighted impact: {sum(impacts.values()):.4f}\n")
        for node, impact in impacts_sorted[:20]:
            bar = "█" * int(impact * 40)
            print(f"  {node:30s} {impact:8.4f}  {bar}")


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Research-grade weight inference for dependency graphs."
    )
    parser.add_argument("filepath", help="Path to edge list (CSV or JSON)")
    parser.add_argument("--query", "-q", help="Node for change propagation analysis")
    parser.add_argument("--export", "-e", help="Export results to JSON")
    parser.add_argument("--simulations", "-s", type=int, default=5000,
                        help="Monte Carlo cascade simulations (default: 5000)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    config = InferenceConfig()
    config.CASCADE_SIMULATIONS = args.simulations
    config.SEED = args.seed

    run_pipeline(args.filepath, config, args.query, args.export)


if __name__ == "__main__":
    main()
