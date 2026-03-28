# Module 2A — Cascade Engine

## Purpose

Given a graph G and an event, compute the exact chain reaction: which nodes degrade, which nodes fail, and what the final network state is. This is pure math — no AI, no randomness, fully deterministic.

---

## Event Definition

An event is the input that triggers a cascade:

```
Event e = {
    target:    node_id or [node_ids]   — which node(s) are hit
    action:    enum                     — what happens to them
    magnitude: float [0, 1]            — how severe
}

Actions:
    "kill"       — set h_target = 0, mark φ = true
    "damage"     — h_target = h_target × (1 - magnitude)
    "cut_edge"   — remove edge (target = {from, to})
```

---

## Cascade Propagation Algorithm

### Core Equation

When node v dies or loses health, it damages every node that depends on it:

```
For each node u where edge (v → u) exists:
    damage_to_u = edge_weight(v, u) × θ_v × (1 - h_v)
```

Breaking this down:

- `edge_weight(v, u)`: how much u depends on v (from adjacency matrix)
- `θ_v`: how important v is to the network
- `(1 - h_v)`: how much health v has lost (1 - h_v = 0 if v is fully healthy, = 1 if v is dead)

The damage is proportional to both the dependency strength AND the importance of the failed node AND how badly it failed.

### Health Update

After computing damage from all degraded/failed nodes:

```
h_u(t+1) = max(0, h_u(t) - Σ_v damage_from_v_to_u)
```

Where the sum is over all nodes v that have lost health since the last step.

### Failure Check

After updating health:

```
If h_u(t+1) ≤ 0:
    h_u(t+1) = 0
    φ_u = true    (permanently failed)
```

A node that hits zero health is permanently dead for the rest of this simulation.

---

## Full Algorithm

```
function CASCADE(G, event):

    Input:  G = graph (nodes with h, θ, r, φ; edges with weight)
            event = {target, action, magnitude}
    Output: cascade_log, final_state, metrics

    // Step 0: Save initial state
    state_before = snapshot(G)
    cascade_log = []
    step = 0

    // Step 1: Apply initial event
    apply_event(G, event)
    new_failures = {nodes where φ just became true}
    new_degraded = {nodes where h decreased but φ is still false}

    cascade_log.append({
        step: 0,
        trigger: "initial_event",
        event: event,
        new_failures: new_failures,
        new_degraded: new_degraded
    })

    // Step 2: Propagate cascade
    while true:
        step += 1
        changed_nodes = new_failures ∪ new_degraded

        if changed_nodes is empty:
            break    // Fixed point reached

        next_failures = {}
        next_degraded = {}

        // For each node that changed in the previous step
        for v in changed_nodes:

            // Find all nodes that depend on v
            for u where A[u][v] > 0 and φ_u == false:

                damage = A[u][v] × θ_v × (1 - h_v)
                h_u = max(0, h_u - damage)

                if h_u <= 0:
                    h_u = 0
                    φ_u = true
                    next_failures.add(u)
                elif damage > 0:
                    next_degraded.add(u)

        if next_failures is empty and next_degraded is empty:
            break    // No further propagation

        cascade_log.append({
            step: step,
            trigger: "cascade",
            new_failures: next_failures,
            new_degraded: next_degraded,
            damages: {u: damage_value for each affected u}
        })

        new_failures = next_failures
        new_degraded = next_degraded

        // Safety: prevent infinite loops
        if step > len(G.nodes):
            break

    // Step 3: Compute metrics
    state_after = snapshot(G)
    metrics = compute_cascade_metrics(state_before, state_after, cascade_log)

    return cascade_log, state_after, metrics
```

---

## Cascade Metrics

Computed after cascade reaches fixed point:

```
cascade_size = |{i : φ_i = true}| / n
    — fraction of nodes that died (0 to 1)

cascade_depth = number of propagation steps
    — how many "hops" the failure traveled

health_loss = H(before) - H(after)
    — drop in network health score (θ-weighted)

nodes_failed = list of all nodes where φ = true
    — which specific nodes died

nodes_degraded = list of nodes where h decreased but φ = false
    — which nodes were damaged but survived

cross_layer_failures = count of failures where the causing node
    and the failed node are in different layers
    — how much the cascade crossed layer boundaries

layer_damage = {layer: Hᵅ(before) - Hᵅ(after)}
    — health loss per layer

total_recovery_cost = Σ rᵢ for all nodes where φ_i = true
    — how much it would cost to restore everything
```

---

## Convergence Proof

The cascade is guaranteed to terminate because:

1. Node health h is bounded in [0, 1] and can only decrease during a cascade
2. Once a node fails (φ = true), it stays failed — failure is absorbing
3. A failed node can only cause damage once per step (it doesn't re-trigger)
4. There are finitely many nodes (n)
5. Therefore: at most n steps, at most n failures

**Worst case complexity:** O(n² × E) where n = number of nodes, E = number of edges.

In practice, cascades terminate much faster because:

- Most nodes don't fail
- Damage attenuates as it propagates (multiplied by weights < 1)
- The `θ × weight` product is usually << 1

---

## Compound Events

Multiple events can be applied before running the cascade:

```
function CASCADE_COMPOUND(G, events: [Event]):
    for event in events:
        apply_event(G, event)    // Apply all events FIRST

    // THEN run single cascade propagation
    // This captures interaction effects between simultaneous failures
    return CASCADE(G, null)  // cascade from current state
```

This is important because two simultaneous failures can be worse than the sum of two individual failures (synergy effect).

---

## Reset

```
function RESET(G):
    for each node i:
        h_i = 1.0
        φ_i = false
    // θ and r values are NOT reset — they're properties of the node
    // edges are NOT modified
```

---

## Edge Cases

```
1. Event targets already-dead node:
   → No effect. Skip.

2. Event targets non-existent node:
   → Error. Reject event.

3. Damage value is negative (would heal):
   → Clamp to 0. Cascades only cause damage, never healing.

4. All nodes die:
   → H = 0. Cascade terminates. Total system failure.

5. Node with θ = 0 fails:
   → No damage propagates from it (damage = weight × 0 = 0).
   → But it still shows as failed in the log.

6. Circular dependencies (A depends on B depends on A):
   → Handled correctly. A's failure damages B, B's failure
   → damages A further, but since A is already damaged,
   → the additional damage is smaller (multiplicative).
   → Converges because damage attenuates.
```
