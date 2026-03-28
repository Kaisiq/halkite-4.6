# Module 1A — Graph Model

## Data Structures

### Node

Every entity in the system is a node with exactly 3 mathematical values plus structured metadata.

The research-backed design rule is:

- runtime math stays minimal and deterministic
- graph construction stores the evidence and features used to derive the math
- AI may propose structure and features, but final mathematical values are produced by deterministic scoring rules and review

This keeps Modules 2-4 stable while making Module 1 auditable and calibratable.

```
Node v = {
    // Identity
    id:    string          — unique identifier
    name:  string          — human-readable label
    layer: string          — which layer this node belongs to

    // Mathematical values (THE ONLY VALUES THAT AFFECT COMPUTATION)
    h:     float [0, 1]    — health (current operational status)
    θ:     float [0, 1]    — network importance derived from deterministic
                              scoring over evidence-backed features
    r:     float ≥ 0       — recovery cost (time or money units to
                              restore this node if it fails)

    // Simulation state
    φ:     bool            — failed flag (true = permanently dead
                              in current simulation)

    // Metadata and provenance (do NOT directly affect math)
    meta: {
        type: string       — person | team | service | process |
                              supplier | facility | asset |
                              revenue_stream | control
        function: string   — canonical business/technical function
        owner: string|null — responsible team or person
        location: string|null
        capacity: float|null
        substitutability: float [0, 1] | null
        max_tolerable_downtime_hours: float | null
        single_point_of_failure: bool | null
        upstream_count: int | null
        downstream_count: int | null
        evidence: [
            {
                kind: string       — document | interview | incident |
                                     architecture_diagram | system_log |
                                     org_chart
                source: string     — file name, interview id, incident id
                confidence: float [0, 1]
                note: string|null
            }
        ]
        judgment_basis: {
            theta_method: string   — deterministic formula used
            recovery_method: string
        } | null
    }
}
```

**Initial state for all nodes:** `h = 1.0, φ = false`

### Node Value Derivation

`θ` must not be assigned as a raw guess by the LLM.

Instead, it is derived offline from structured features such as:

- deterministic blast-radius from weakpoint analysis
- operational criticality
- irreplaceability / substitutability
- recovery burden
- historical incident impact

Recommended scoring pattern:

```text
θ_v = clamp(
    a1 * blast_radius_score(v) +
    a2 * irreplaceability_score(v) +
    a3 * operational_criticality_score(v) +
    a4 * recovery_penalty_score(v) +
    a5 * historical_incident_score(v),
    0,
    1
)
```

The exact coefficients are a product policy choice and must be versioned.

### Edge

A dependency between two nodes. Direction matters: `from → to` means "to depends on from."

The edge represents a causal dependency, not correlation, communication frequency, or org-chart proximity.

```
Edge e = {
    from:   node_id        — the node being depended ON
    to:     node_id        — the node that DEPENDS on the other
    weight: float [0, 1]   — strength of dependency
                              (1.0 = total dependency, 0.1 = weak dependency)
    meta: {
        dependency_type: string   — operational | informational |
                                    control | physical | financial |
                                    regulatory | managerial
        directness: string        — direct | inferred | reconstructed
        substitutes_available: int | null
        time_to_substitute_hours: float | null
        minimum_support_required: float [0, 1] | null
        evidence: [
            {
                kind: string
                source: string
                confidence: float [0, 1]
                note: string|null
            }
        ]
        scoring_features: {
            operational: float [0, 1] | null
            informational: float [0, 1] | null
            control: float [0, 1] | null
            physical: float [0, 1] | null
            financial: float [0, 1] | null
            substitutability_penalty: float [0, 1] | null
            workaround_delay: float [0, 1] | null
        } | null
    }
}
```

**Interpretation:** If edge weight from A to B is 0.8, then B depends on A at strength 0.8. If A dies, B takes `0.8 × θ_A` damage.

Edges can connect nodes within the same layer or across different layers. The math treats them identically.

### Edge Weight Derivation

`weight` must not be assigned as a raw guess by the LLM.

Instead, it is derived offline from extracted dependency features.

Recommended scoring pattern:

```text
w(source -> target) = clamp(
    b1 * operational +
    b2 * informational +
    b3 * control +
    b4 * physical +
    b5 * financial +
    b6 * substitutability_penalty +
    b7 * workaround_delay,
    0,
    1
)
```

The coefficients may vary by layer combination, but the scoring policy must be deterministic and versioned.

### Graph

The complete network:

```
Graph G = {
    nodes: [Node]          — list of all nodes
    edges: [Edge]          — list of all edges
    layers: [string]       — list of layer names (for grouping/display)
    scoring_policy: {
        version: string
        theta_formula: string
        edge_formula: string
        recovery_unit: string
    }
}
```

Internally stored as:

- **Adjacency matrix A** ∈ ℝ^(n × n) where A[i][j] = weight of edge from node j to node i
- **Node vectors** h ∈ ℝⁿ, θ ∈ ℝⁿ, r ∈ ℝⁿ
- **Layer assignment** layer: node_id → string

### Adjacency Matrix Convention

```
A[i][j] = weight of edge FROM node j TO node i
         = how much node i depends on node j

A[i][j] = 0 means node i does not depend on node j
```

This convention means: column j represents "who depends on node j" — so when node j dies, column j tells us who gets damaged and by how much.

---

## Validation Rules

### Node Validation

```
- id must be unique across all nodes (regardless of layer)
- h must be in [0, 1]
- θ must be in [0, 1]
- r must be ≥ 0
- layer must be a string present in G.layers
- meta.type must be present
- meta.function should be present unless the node is truly generic
- meta.evidence must contain at least 1 item for production graphs
- At least one edge must connect to this node (isolated nodes are warnings)
- single_point_of_failure nodes should be flagged for analyst review
```

### Edge Validation

```
- from and to must reference existing node ids
- from ≠ to (no self-loops)
- weight must be in (0, 1] (weight of 0 means no edge, don't store it)
- No duplicate edges (same from-to pair)
- edge meta.dependency_type must be present
- edge meta.evidence must contain at least 1 item for production graphs
- edge must encode a causal dependency, not mere association
- inferred or reconstructed edges should be reviewable separately
```

### Graph Validation

```
- At least 2 nodes
- At least 1 edge
- Graph should be weakly connected (warn if disconnected components exist)
- At least 1 layer
- Σ θ > 0 (at least one node must matter)
- scoring_policy must be present
- all mathematical values must be reproducible from stored features or evidence
```

### Graph Quality Gates

These are not schema failures, but they indicate a weak graph:

```text
- Too many edges marked inferred relative to direct/documented
- High-θ nodes with weak or missing evidence
- Critical cross-layer processes with no cross-layer edges
- Many nodes with zero substitutes but low θ
- Historical incidents that cannot be reproduced by the current graph
```

---

## Network Health Function

The overall health of the network at any point in time:

```
H(G) = Σᵢ (hᵢ · θᵢ) / Σᵢ θᵢ
```

This is a **θ-weighted average of all node healths.** Losing a high-θ node hurts the score more than losing a low-θ node.

**Properties:**

- H ∈ [0, 1]
- H = 1.0 when all nodes are fully healthy
- H = 0.0 when all nodes are dead
- If only nodes with θ = 0 are damaged, H doesn't change (unimportant nodes)

### Per-Layer Health

```
Hᵅ(G) = Σᵢ∈α (hᵢ · θᵢ) / Σᵢ∈α θᵢ
```

Same formula filtered to nodes in layer α.

---

## State Snapshot

A **state** is a frozen copy of all node values at a point in time:

```
State s = {
    h: [float]     — vector of all health values, length n
    φ: [bool]      — vector of all failed flags, length n
    H: float       — network health at this state
    Hᵅ: {layer: float}  — per-layer health
}
```

States are immutable. When an event modifies the network, a new state is created.

**State equality:** Two states are equal if their h and φ vectors are identical (within floating point tolerance ε = 1e-6).

---

## Layer Conventions

Layers are flexible labels. The system does not hardcode any layer names. However, the AI graph builder should use consistent naming. Suggested defaults:

```
"People"       — employees, roles, teams, contractors
"Technology"   — software, hardware, cloud services, data
"Supply"       — suppliers, materials, logistics, inventory
"Financial"    — revenue streams, clients, bank accounts, credit
"Facilities"   — offices, warehouses, equipment, vehicles
"Operations"   — processes, permits, licenses, workflows
```

Users can define any layer names. The math does not depend on layer semantics.
