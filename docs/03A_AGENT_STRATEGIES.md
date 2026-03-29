# Module 3A — Agent Strategies

## Purpose

Define exactly how each agent explores the state tree. Each agent receives a brief (Module 3) and uses a specific strategy to select which events to explore at each level of the tree.

---

## Agent Interface

Every agent implements the same interface:

```
class Agent:
    brief: AgentBrief          // From Module 3

    function select_events(state: State, depth: int) -> [Event]:
        // Given current network state and tree depth,
        // return a list of events to explore as branches
        // Length of list = branching_factor from brief
```

The state tree (Module 4) calls `select_events` at each tree node. The agent returns events, the tree applies each one (using the cascade engine from Module 2A), and recurses.

For scenario-generation agents, AI may propose a small set of realistic, high-impact plans as long as the cascade math and ranking stay deterministic.

The preferred pattern is to build graph-grounded candidate paths first and let AI choose and explain only those candidates. That keeps every scenario tied to a real dependency path, isolation cut, or converging failure mechanism instead of producing unrelated node sequences.

---

## Agent 1: Critical Node Attacker

**Goal:** Find the steepest collapse path — always kill what hurts most.

```
function select_events(state, depth):
    // Recalculate impact ranking on CURRENT state
    // (not the original graph — nodes may already be dead)
    surviving_nodes = [n for n in state.nodes if n.φ == false]

    // Filter to priority targets first, then expand if needed
    candidates = [n for n in surviving_nodes if n.id in brief.priority_targets]
    if len(candidates) < brief.branching_factor:
        candidates = surviving_nodes

    // Score each candidate: how much damage would killing it do NOW?
    scored = []
    for node in candidates:
        state_copy = copy(state)
        state_copy.nodes[node.id].h = 0
        state_copy.nodes[node.id].φ = true
        cascade_result = CASCADE(state_copy)
        score = state.H - cascade_result.H
        scored.append((node, score))

    // Take top branching_factor by score
    scored.sort(by=score, descending)

    return [
        Event(target=node.id, action="kill")
        for node, score in scored[:brief.branching_factor]
    ]
```

**Properties:**

- Greedy: always picks locally optimal choice
- Recalculates at every depth (state-aware)
- Finds the worst single-chain path but may miss multi-path scenarios

---

## Agent 2: Bridge Breaker

**Goal:** Fragment the network into disconnected components.

```
function select_events(state, depth):
    surviving = [n for n in state.nodes if n.φ == false]

    // Build subgraph of surviving nodes
    G_surviving = build_subgraph(state)

    // Find current bridge nodes in surviving graph
    bridges = BRIDGE_NODE_DETECTION(G_surviving)

    if len(bridges) > 0:
        // Kill bridge nodes
        events = [
            Event(target=b.node, action="kill")
            for b in bridges[:brief.branching_factor]
        ]
    else:
        // No bridges — cut critical edges instead
        critical_edges = CRITICAL_EDGE_DETECTION(G_surviving)
        events = [
            Event(target={from: e.from_node, to: e.to_node}, action="cut_edge")
            for e in critical_edges[:brief.branching_factor]
        ]

    return events
```

**Properties:**

- Recalculates bridges at each depth (topology changes as nodes die)
- Can switch between killing nodes and cutting edges
- Maximizes network fragmentation, not just health loss

---

## Agent 3: Compound Exploiter

**Goal:** Find combinations of failures with super-additive damage (synergy).

```
function select_events(state, depth):
    surviving = [n for n in state.nodes if n.φ == false]

    if depth == 0:
        // First move: use pre-computed high-synergy pairs from brief
        return brief.initial_events[:brief.branching_factor]

    // After first move: find which remaining nodes have
    // highest synergy with ALREADY-DEAD nodes
    dead_nodes = [n for n in state.nodes if n.φ == true]

    scored = []
    for node in surviving:
        if node.id not in brief.priority_targets:
            continue

        state_copy = copy(state)
        state_copy.nodes[node.id].h = 0
        state_copy.nodes[node.id].φ = true
        cascade_result = CASCADE(state_copy)

        // Expected damage (individual impact from original analysis)
        expected = original_impact[node.id]
        // Actual damage given current state
        actual = state.H - cascade_result.H
        // Synergy with already-dead nodes
        synergy = actual - expected

        scored.append((node, actual, synergy))

    // Prioritize high-synergy nodes (unexpected extra damage)
    scored.sort(by=synergy, descending)

    return [
        Event(target=node.id, action="kill")
        for node, _, _ in scored[:brief.branching_factor]
    ]
```

**Properties:**

- Explicitly searches for synergistic failure combinations
- First move uses pre-computed pairs
- Subsequent moves look for chain reactions that amplify previous damage

---

## Agent 4: Layer Assassin

**Goal:** Systematically destroy one layer and observe cross-layer cascading.

```
function select_events(state, depth):
    target_layer = brief.focus_layers[0]

    // Get surviving nodes in target layer
    layer_survivors = [
        n for n in state.nodes
        if n.φ == false and n.layer == target_layer
    ]

    if len(layer_survivors) == 0:
        // Target layer fully destroyed — switch to observing cascades
        // Attack the most damaged surviving node in OTHER layers
        other_survivors = [
            n for n in state.nodes
            if n.φ == false and n.layer != target_layer
        ]
        other_survivors.sort(by=h, ascending)  // Most damaged first
        return [
            Event(target=n.id, action="kill")
            for n in other_survivors[:brief.branching_factor]
        ]

    // Kill highest-θ surviving node in target layer
    layer_survivors.sort(by=theta, descending)

    return [
        Event(target=n.id, action="kill")
        for n in layer_survivors[:brief.branching_factor]
    ]
```

**Properties:**

- Focused destruction of one layer
- After layer is dead, explores how damage propagates to other layers
- Answers "what if your entire IT department / supply chain / etc. goes down?"

---

## Agent 5: Cluster Isolator

**Goal:** Cut off tightly-coupled clusters from the rest of the network.

```
function select_events(state, depth):
    // Recompute clusters on surviving graph
    G_surviving = build_subgraph(state)
    clusters = CLUSTER_DETECTION(G_surviving)

    if len(clusters) == 0:
        // No clusters — fall back to critical node attack
        return Agent1.select_events(state, depth)

    // Find most valuable cluster to isolate
    target_cluster = max(clusters, by=cluster_impact × isolation_risk)

    // Find boundary edges (connecting cluster to outside)
    boundary_edges = [
        (u, v, w) for (u, v, w) in G_surviving.edges
        if (u in target_cluster.nodes) != (v in target_cluster.nodes)
    ]

    if len(boundary_edges) > 0:
        // Cut boundary edges
        boundary_edges.sort(by=weight, descending)
        events = [
            Event(target={from: u, to: v}, action="cut_edge")
            for u, v, w in boundary_edges[:brief.branching_factor]
        ]
    else:
        // Kill boundary nodes
        events = [
            Event(target=n, action="kill")
            for n in target_cluster.boundary_nodes[:brief.branching_factor]
        ]

    return events
```

**Properties:**

- Isolates clusters by cutting their connections to the rest
- Combines edge cutting and node killing
- Answers "what if this department / supplier group gets cut off?"

---

## Event Types Summary

| Agent            | Primary Action           | Secondary Action       | Focus                 |
| ---------------- | ------------------------ | ---------------------- | --------------------- |
| Critical Node    | kill highest-impact node | —                      | Health loss           |
| Bridge Breaker   | kill bridge node         | cut critical edge      | Fragmentation         |
| Compound         | kill synergy pairs       | kill synergy chains    | Super-additive damage |
| Layer Assassin   | kill in target layer     | kill in cascade layers | Layer destruction     |
| Cluster Isolator | cut boundary edges       | kill boundary nodes    | Isolation             |

---

## Agent Concurrency

For the hackathon: agents run **sequentially** (simpler to implement).

For production: agents can run in **parallel** since each agent works on independent copies of the state tree. No shared mutable state. Each agent produces its own tree branches.

```
Hackathon:
    for agent in agents:
        agent.explore(G, max_depth)

Production:
    parallel_map(lambda agent: agent.explore(G, max_depth), agents)
```
