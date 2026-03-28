# Module 1A — Graph Model

## Data Structures

### Node

Every entity in the system is a node with exactly 3 mathematical values plus metadata:

```
Node v = {
    // Identity
    id:    string          — unique identifier
    name:  string          — human-readable label
    layer: string          — which layer this node belongs to
    
    // Mathematical values (THE ONLY VALUES THAT AFFECT COMPUTATION)
    h:     float [0, 1]    — health (current operational status)
    θ:     float [0, 1]    — network dependency (how much the network
                              depends on this node, aka importance weight)
    r:     float ≥ 0       — recovery cost (time or money units to 
                              restore this node if it fails)
    
    // Simulation state
    φ:     bool            — failed flag (true = permanently dead 
                              in current simulation)
    
    // Metadata (for display only, does NOT affect math)
    meta:  dict            — arbitrary key-value pairs 
                              (role, location, description, etc.)
}
```

**Initial state for all nodes:** `h = 1.0, φ = false`

### Edge

A dependency between two nodes. Direction matters: `from → to` means "to depends on from."

```
Edge e = {
    from:   node_id        — the node being depended ON
    to:     node_id        — the node that DEPENDS on the other
    weight: float [0, 1]   — strength of dependency
                              (1.0 = total dependency, 0.1 = weak dependency)
}
```

**Interpretation:** If edge weight from A to B is 0.8, then B depends on A at strength 0.8. If A dies, B takes `0.8 × θ_A` damage.

Edges can connect nodes within the same layer or across different layers. The math treats them identically.

### Graph

The complete network:

```
Graph G = {
    nodes: [Node]          — list of all nodes
    edges: [Edge]          — list of all edges
    layers: [string]       — list of layer names (for grouping/display)
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
- At least one edge must connect to this node (isolated nodes are warnings)
```

### Edge Validation

```
- from and to must reference existing node ids
- from ≠ to (no self-loops)
- weight must be in (0, 1] (weight of 0 means no edge, don't store it)
- No duplicate edges (same from-to pair)
```

### Graph Validation

```
- At least 2 nodes
- At least 1 edge
- Graph should be weakly connected (warn if disconnected components exist)
- At least 1 layer
- Σ θ > 0 (at least one node must matter)
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
