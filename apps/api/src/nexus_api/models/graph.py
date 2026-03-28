"""Module 1A — Graph Model.

Core data structures for the NEXUS network survival analyzer.
Implements Node, Edge, Graph, State, and ValidationResult with numpy-backed
adjacency matrices and vector operations. Pure, deterministic — no AI.

References: docs/01A_GRAPH_MODEL.md, docs/02A_CASCADE_ENGINE.md
"""

from __future__ import annotations

import copy
import logging
from typing import Any

import networkx as nx
import numpy as np
import numpy.typing as npt

logger = logging.getLogger(__name__)

# Floating-point tolerance for state equality checks.
_EPSILON: float = 1e-6


# ---------------------------------------------------------------------------
# ValidationResult
# ---------------------------------------------------------------------------

class ValidationResult:
    """Accumulates warnings and errors produced during graph validation."""

    __slots__ = ("errors", "warnings")

    def __init__(self) -> None:
        self.warnings: list[str] = []
        self.errors: list[str] = []

    @property
    def is_valid(self) -> bool:
        """A graph is considered valid when there are zero errors.

        Warnings are informational and do not block computation.
        """
        return len(self.errors) == 0

    def __repr__(self) -> str:
        return (
            f"ValidationResult(errors={len(self.errors)}, "
            f"warnings={len(self.warnings)})"
        )


# ---------------------------------------------------------------------------
# State (immutable snapshot)
# ---------------------------------------------------------------------------

class State:
    """Frozen snapshot of network health at a single point in time.

    State objects are treated as immutable after construction.  Equality is
    defined over *h* and *phi* vectors using floating-point tolerance
    ``_EPSILON``.
    """

    __slots__ = ("H", "H_per_layer", "h", "phi")

    def __init__(
        self,
        h: list[float],
        phi: list[bool],
        H: float,
        H_per_layer: dict[str, float],
    ) -> None:
        self.h: list[float] = h
        self.phi: list[bool] = phi
        self.H: float = H
        self.H_per_layer: dict[str, float] = H_per_layer

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, State):
            return NotImplemented
        if len(self.h) != len(other.h):
            return False
        for a, b in zip(self.h, other.h, strict=True):
            if abs(a - b) > _EPSILON:
                return False
        return self.phi == other.phi

    def __repr__(self) -> str:
        return f"State(H={self.H:.4f}, failed={sum(self.phi)})"

    def to_dict(self) -> dict[str, Any]:
        return {
            "h": list(self.h),
            "phi": list(self.phi),
            "H": self.H,
            "H_per_layer": dict(self.H_per_layer),
        }


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------

class Node:
    """A single entity in the dependency network.

    Mathematical values (``h``, ``theta``, ``r``) are the **only** values
    that affect computation.  ``meta`` is carried through for display but
    never read by the math engine.
    """

    __slots__ = ("h", "id", "layer", "meta", "name", "phi", "r", "theta")

    def __init__(
        self,
        id: str,
        name: str,
        layer: str,
        *,
        h: float = 1.0,
        theta: float = 0.0,
        r: float = 0.0,
        phi: bool = False,
        meta: dict[str, Any] | None = None,
    ) -> None:
        self.id: str = id
        self.name: str = name
        self.layer: str = layer
        self.h: float = h
        self.theta: float = theta
        self.r: float = r
        self.phi: bool = phi
        self.meta: dict[str, Any] = meta if meta is not None else {}

    def __repr__(self) -> str:
        return (
            f"Node(id={self.id!r}, name={self.name!r}, layer={self.layer!r}, "
            f"h={self.h:.2f}, θ={self.theta:.2f}, r={self.r:.2f}, φ={self.phi})"
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "layer": self.layer,
            "h": self.h,
            "theta": self.theta,
            "r": self.r,
            "phi": self.phi,
            "meta": dict(self.meta),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Node:
        """Construct a Node from a plain dictionary (e.g. JSON payload).

        Raises ``KeyError`` when ``"id"`` or ``"layer"`` is missing.
        """
        if "layer" not in data:
            raise KeyError(
                f"Node {data.get('id', '?')!r} is missing required 'layer' field"
            )
        return cls(
            id=str(data["id"]),
            name=str(data.get("name", data["id"])),
            layer=str(data["layer"]),
            h=float(data.get("h", 1.0)),
            theta=float(data.get("theta", 0.0)),
            r=float(data.get("r", 0.0)),
            phi=bool(data.get("phi", False)),
            meta=dict(data.get("meta", {})),
        )


# ---------------------------------------------------------------------------
# Edge
# ---------------------------------------------------------------------------

class Edge:
    """Directed dependency between two nodes.

    Direction semantics: ``from_id -> to_id`` means *to_id depends on
    from_id*.  If from_id degrades, to_id takes damage proportional to
    ``weight * theta_from * (1 - h_from)``.
    """

    __slots__ = ("from_id", "meta", "to_id", "weight")

    def __init__(
        self,
        from_id: str,
        to_id: str,
        weight: float = 1.0,
        meta: str | dict[str, Any] | None = None,
    ) -> None:
        self.from_id: str = from_id
        self.to_id: str = to_id
        self.weight: float = weight
        self.meta: str | dict[str, Any] | None = meta

    def __repr__(self) -> str:
        return (
            f"Edge({self.from_id!r} -> {self.to_id!r}, w={self.weight:.2f})"
        )

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "from": self.from_id,
            "to": self.to_id,
            "weight": self.weight,
        }
        if self.meta is not None:
            d["meta"] = self.meta
        return d

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Edge:
        """Construct an Edge from a plain dictionary (e.g. JSON payload)."""
        return cls(
            from_id=str(data["from"]),
            to_id=str(data["to"]),
            weight=float(data.get("weight", 1.0)),
            meta=data.get("meta"),
        )


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

class Graph:
    """Complete dependency network with numpy-backed linear algebra.

    Internal storage
    ----------------
    *   ``_A`` — adjacency matrix, shape ``(n, n)``.
        ``_A[i][j]`` = weight of edge **from** node *j* **to** node *i*,
        i.e. how much node *i* depends on node *j*.
    *   ``_h``, ``_theta``, ``_r`` — numpy vectors of length *n*.
    *   ``_node_index`` — ``{node_id: int}`` mapping into the vectors.

    The matrix and vectors are rebuilt via :meth:`build_adjacency_matrix`
    whenever the topology changes.
    """

    def __init__(
        self,
        nodes: list[Node] | None = None,
        edges: list[Edge] | None = None,
        layers: list[str] | None = None,
    ) -> None:
        self.nodes: list[Node] = nodes if nodes is not None else []
        self.edges: list[Edge] = edges if edges is not None else []
        self.layers: list[str] = layers if layers is not None else []

        # Internal numpy representations — populated by build_adjacency_matrix.
        self._A: npt.NDArray[np.float64] = np.empty((0, 0), dtype=np.float64)
        self._h: npt.NDArray[np.float64] = np.empty(0, dtype=np.float64)
        self._theta: npt.NDArray[np.float64] = np.empty(0, dtype=np.float64)
        self._r: npt.NDArray[np.float64] = np.empty(0, dtype=np.float64)
        self._node_index: dict[str, int] = {}

        if self.nodes:
            self.build_adjacency_matrix()

    # ------------------------------------------------------------------
    # Properties — keep numpy vectors in sync with Node objects
    # ------------------------------------------------------------------

    @property
    def node_index(self) -> dict[str, int]:
        """Node-id-to-index mapping."""
        return self._node_index

    @property
    def A(self) -> npt.NDArray[np.float64]:
        """The adjacency matrix (read-only reference)."""
        return self._A

    @property
    def adjacency_matrix(self) -> npt.NDArray[np.float64]:
        """Alias for :pyattr:`A`."""
        return self._A

    @property
    def h(self) -> npt.NDArray[np.float64]:
        """Health vector (read-only reference)."""
        return self._h

    @property
    def h_vector(self) -> npt.NDArray[np.float64]:
        """Alias for :pyattr:`h`."""
        return self._h

    @property
    def theta(self) -> npt.NDArray[np.float64]:
        """Theta (importance) vector (read-only reference)."""
        return self._theta

    @property
    def theta_vector(self) -> npt.NDArray[np.float64]:
        """Alias for :pyattr:`theta`."""
        return self._theta

    @property
    def r(self) -> npt.NDArray[np.float64]:
        """Recovery-cost vector (read-only reference)."""
        return self._r

    @property
    def r_vector(self) -> npt.NDArray[np.float64]:
        """Alias for :pyattr:`r`."""
        return self._r

    # ------------------------------------------------------------------
    # Build / sync helpers
    # ------------------------------------------------------------------

    def build_adjacency_matrix(self) -> None:
        """(Re)build the adjacency matrix and node vectors from the current
        lists of nodes and edges.

        Must be called after any structural mutation (add/remove node or edge).
        """
        n = len(self.nodes)
        self._node_index = {node.id: idx for idx, node in enumerate(self.nodes)}

        self._A = np.zeros((n, n), dtype=np.float64)
        self._h = np.array([node.h for node in self.nodes], dtype=np.float64)
        self._theta = np.array(
            [node.theta for node in self.nodes], dtype=np.float64
        )
        self._r = np.array([node.r for node in self.nodes], dtype=np.float64)

        for edge in self.edges:
            i = self._node_index.get(edge.to_id)
            j = self._node_index.get(edge.from_id)
            if i is not None and j is not None:
                self._A[i, j] = edge.weight

    def rebuild(self) -> None:
        """Alias for ``build_adjacency_matrix`` — convenient after bulk edits."""
        self.build_adjacency_matrix()

    def _sync_vectors_to_nodes(self) -> None:
        """Push current numpy *h* values back onto the Node objects.

        Called internally after computations that modify the vectors directly
        (e.g. cascade engine operating on ``_h``).
        """
        for node in self.nodes:
            idx = self._node_index[node.id]
            node.h = float(self._h[idx])
            if node.h <= 0:
                node.phi = True

    def _sync_nodes_to_vectors(self) -> None:
        """Pull *h*, *theta*, *r* from Node objects into numpy vectors.

        Useful after manual edits to individual Node attributes.
        """
        for node in self.nodes:
            idx = self._node_index[node.id]
            self._h[idx] = node.h
            self._theta[idx] = node.theta
            self._r[idx] = node.r

    # ------------------------------------------------------------------
    # Health metrics
    # ------------------------------------------------------------------

    def network_health(self) -> float:
        """Compute H(G) = sum(h_i * theta_i) / sum(theta_i).

        Returns 0.0 if all theta values are zero (degenerate graph).
        """
        self._sync_nodes_to_vectors()
        theta_sum: float = float(np.sum(self._theta))
        if theta_sum <= 0.0:
            return 0.0
        return float(np.dot(self._h, self._theta) / theta_sum)

    def layer_health(self, layer: str) -> float:
        """Compute per-layer health H_layer(G).

        Same formula as :meth:`network_health` but restricted to nodes whose
        ``layer`` matches *layer*.

        Returns 0.0 if the layer has no nodes or all its theta values are zero.
        """
        self._sync_nodes_to_vectors()
        mask = np.array(
            [node.layer == layer for node in self.nodes], dtype=np.bool_
        )
        theta_layer = self._theta[mask]
        h_layer = self._h[mask]
        theta_sum: float = float(np.sum(theta_layer))
        if theta_sum <= 0.0:
            return 0.0
        return float(np.dot(h_layer, theta_layer) / theta_sum)

    # ------------------------------------------------------------------
    # State snapshot
    # ------------------------------------------------------------------

    def snapshot(self) -> State:
        """Create a frozen :class:`State` from the current graph values."""
        self._sync_nodes_to_vectors()
        H = self.network_health()
        H_per_layer: dict[str, float] = {}
        for layer in self.layers:
            H_per_layer[layer] = self.layer_health(layer)
        return State(
            h=[float(v) for v in self._h],
            phi=[node.phi for node in self.nodes],
            H=H,
            H_per_layer=H_per_layer,
        )

    # ------------------------------------------------------------------
    # Deep copy / reset
    # ------------------------------------------------------------------

    def deep_copy(self) -> Graph:
        """Return a fully independent clone of this graph.

        All Node and Edge objects, numpy arrays, and metadata are deep-copied
        so that mutations to the clone cannot affect the original.
        """
        new_nodes = [
            Node(
                id=n.id,
                name=n.name,
                layer=n.layer,
                h=n.h,
                theta=n.theta,
                r=n.r,
                phi=n.phi,
                meta=copy.deepcopy(n.meta),
            )
            for n in self.nodes
        ]
        new_edges = [
            Edge(from_id=e.from_id, to_id=e.to_id, weight=e.weight, meta=e.meta)
            for e in self.edges
        ]
        new_layers = list(self.layers)
        g = Graph(nodes=new_nodes, edges=new_edges, layers=new_layers)
        return g

    def reset(self) -> None:
        """Reset all nodes to pristine health.

        Sets ``h = 1.0`` and ``phi = False`` for every node.  Theta, r, and
        edge topology are **not** modified.
        """
        for node in self.nodes:
            node.h = 1.0
            node.phi = False
        if len(self._h) == len(self.nodes):
            self._h[:] = 1.0
        else:
            self.build_adjacency_matrix()

    # ------------------------------------------------------------------
    # Node / edge accessors & mutators
    # ------------------------------------------------------------------

    def get_node(self, node_id: str) -> Node:
        """Retrieve a node by its id.

        Raises ``KeyError`` if not found.
        """
        idx = self._node_index.get(node_id)
        if idx is None:
            raise KeyError(f"Node {node_id!r} not found in graph")
        return self.nodes[idx]

    def get_node_index(self, node_id: str) -> int:
        """Return the numeric index for *node_id* within the node vectors.

        Raises ``KeyError`` if not found.
        """
        idx = self._node_index.get(node_id)
        if idx is None:
            raise KeyError(f"Node {node_id!r} not found in graph")
        return idx

    def remove_edge(self, from_id: str, to_id: str) -> None:
        """Remove the directed edge from *from_id* to *to_id*.

        Raises ``ValueError`` if no such edge exists.  Rebuilds the adjacency
        matrix after removal.
        """
        for i, edge in enumerate(self.edges):
            if edge.from_id == from_id and edge.to_id == to_id:
                self.edges.pop(i)
                self.build_adjacency_matrix()
                return
        raise ValueError(
            f"Edge ({from_id!r} -> {to_id!r}) not found in graph"
        )

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def validate(self) -> ValidationResult:
        """Run all validation checks.

        Delegates to :meth:`_validate_nodes`, :meth:`_validate_edges`, and
        :meth:`_validate_graph` and merges the results.
        """
        result = ValidationResult()
        self._validate_nodes(result)
        self._validate_edges(result)
        self._validate_graph(result)
        return result

    def _validate_nodes(self, result: ValidationResult) -> None:
        """Check every node against the spec constraints."""
        seen_ids: set[str] = set()

        # Pre-compute set of node ids that participate in at least one edge.
        connected_ids: set[str] = set()
        for edge in self.edges:
            connected_ids.add(edge.from_id)
            connected_ids.add(edge.to_id)

        for node in self.nodes:
            # Uniqueness
            if node.id in seen_ids:
                result.errors.append(
                    f"Duplicate node id: {node.id!r}"
                )
            seen_ids.add(node.id)

            # Range checks
            if not (0.0 <= node.h <= 1.0):
                result.errors.append(
                    f"Node {node.id!r}: h={node.h} out of [0, 1]"
                )
            if not (0.0 <= node.theta <= 1.0):
                result.errors.append(
                    f"Node {node.id!r}: theta={node.theta} out of [0, 1]"
                )
            if node.r < 0.0:
                result.errors.append(
                    f"Node {node.id!r}: r={node.r} must be >= 0"
                )

            # Layer membership
            if node.layer not in self.layers:
                result.errors.append(
                    f"Node {node.id!r}: layer {node.layer!r} not in "
                    f"graph layers {self.layers}"
                )

            # Isolated node (warning, not error)
            if node.id not in connected_ids:
                result.warnings.append(
                    f"Node {node.id!r} is isolated (no edges connect to it)"
                )

    def _validate_edges(self, result: ValidationResult) -> None:
        """Check every edge against the spec constraints."""
        node_ids: set[str] = {n.id for n in self.nodes}
        seen_pairs: set[tuple[str, str]] = set()

        for edge in self.edges:
            # Endpoints exist
            if edge.from_id not in node_ids:
                result.errors.append(
                    f"Edge from {edge.from_id!r}: node does not exist"
                )
            if edge.to_id not in node_ids:
                result.errors.append(
                    f"Edge to {edge.to_id!r}: node does not exist"
                )

            # No self-loops
            if edge.from_id == edge.to_id:
                result.errors.append(
                    f"Self-loop on node {edge.from_id!r}"
                )

            # Weight range: (0, 1]
            if not (0.0 < edge.weight <= 1.0):
                result.errors.append(
                    f"Edge ({edge.from_id!r} -> {edge.to_id!r}): "
                    f"weight={edge.weight} out of (0, 1]"
                )

            # Duplicate check
            pair = (edge.from_id, edge.to_id)
            if pair in seen_pairs:
                result.errors.append(
                    f"Duplicate edge ({edge.from_id!r} -> {edge.to_id!r})"
                )
            seen_pairs.add(pair)

    def _validate_graph(self, result: ValidationResult) -> None:
        """Check graph-level invariants."""
        # Minimum cardinality
        if len(self.nodes) < 2:
            result.errors.append(
                f"Graph needs at least 2 nodes (has {len(self.nodes)})"
            )
        if len(self.edges) < 1:
            result.errors.append(
                f"Graph needs at least 1 edge (has {len(self.edges)})"
            )
        if len(self.layers) < 1:
            result.errors.append(
                "Graph needs at least 1 layer"
            )

        # Theta check — at least one node must matter.
        theta_sum = sum(n.theta for n in self.nodes)
        if theta_sum <= 0.0:
            result.errors.append(
                "Sum of theta across all nodes is 0 — at least one node "
                "must have theta > 0"
            )

        # Weak connectivity (warning only).
        if len(self.nodes) >= 2 and len(self.edges) >= 1:
            nxg = nx.DiGraph()
            for node in self.nodes:
                nxg.add_node(node.id)
            for edge in self.edges:
                nxg.add_edge(edge.from_id, edge.to_id)
            if not nx.is_weakly_connected(nxg):
                components = list(nx.weakly_connected_components(nxg))
                result.warnings.append(
                    f"Graph is not weakly connected — "
                    f"{len(components)} disconnected components detected"
                )

    # ------------------------------------------------------------------
    # Serialization / deserialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """Serialize the graph to a plain dict suitable for JSON encoding."""
        return {
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
            "layers": list(self.layers),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Graph:
        """Deserialize a graph from a JSON-compatible dict.

        Expected schema::

            {
                "nodes": [{id, name, layer, h, theta, r, phi?, meta?}, ...],
                "edges": [{"from": ..., "to": ..., "weight": ...}, ...],
                "layers": ["People", "Technology", ...]
            }

        This is the primary entry point for hydrating a graph from AI-generated
        JSON or from the ``POST /api/upload`` response.
        """
        layers = [str(item) for item in data.get("layers", [])]

        nodes: list[Node] = []
        for nd in data.get("nodes", []):
            nodes.append(Node.from_dict(nd))

        # If no layers supplied, infer from node layer attributes.
        if not layers:
            seen_layers: list[str] = []
            for n in nodes:
                if n.layer and n.layer not in seen_layers:
                    seen_layers.append(n.layer)
            layers = seen_layers

        edges: list[Edge] = []
        for ed in data.get("edges", []):
            edges.append(Edge.from_dict(ed))

        graph = cls(nodes=nodes, edges=edges, layers=layers)
        return graph

    # ------------------------------------------------------------------
    # Repr
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        return (
            f"Graph(nodes={len(self.nodes)}, edges={len(self.edges)}, "
            f"layers={self.layers})"
        )
