# Module 2 — Weakpoint Analysis

## Purpose

Run pure mathematical analysis on the graph to identify all vulnerabilities. No AI. No randomness. Deterministic results. This module produces the **vulnerability report** that guides the agents in Module 3.

---

## Algorithm 1: Node Impact Ranking

**Question:** "If each node dies one at a time, which causes the most damage?"

```
function NODE_IMPACT_RANKING(G):
    impacts = {}
    
    for each node v in G:
        G_copy = deep_copy(G)
        
        // Kill node v
        event = {target: v.id, action: "kill"}
        _, final_state, metrics = CASCADE(G_copy, event)
        
        impacts[v.id] = {
            health_loss: metrics.health_loss,    // H(before) - H(after)
            cascade_size: metrics.cascade_size,  // fraction of nodes that died
            cascade_depth: metrics.cascade_depth,
            recovery_cost: metrics.total_recovery_cost,
            layers_affected: count unique layers in metrics.nodes_failed
        }
    
    // Sort by health_loss descending
    return sorted(impacts, by=health_loss, descending)
```

**Output:** Ordered list of all nodes ranked by how much damage their removal causes.

**Complexity:** O(n × cascade_cost) = O(n × n² × E) worst case. For 100 nodes: fast. For 10,000 nodes: minutes.

---

## Algorithm 2: Critical Edge Detection

**Question:** "Which single connection, if severed, causes the most damage?"

```
function CRITICAL_EDGE_DETECTION(G):
    edge_impacts = {}
    
    for each edge (u, v) in G:
        G_copy = deep_copy(G)
        
        // Remove edge
        G_copy.remove_edge(u, v)
        
        // Recompute health based on lost dependency
        // Node v lost dependency on u
        // Its health may decrease due to unsatisfied dependencies
        damage_to_v = edge.weight × θ_u
        h_v_new = max(0, h_v - damage_to_v)
        G_copy.nodes[v].h = h_v_new
        
        if h_v_new <= 0:
            G_copy.nodes[v].φ = true
            // Run cascade from v's failure
            _, final_state, metrics = CASCADE(G_copy, null)
            impact = metrics.health_loss
        else:
            impact = H(G) - H(G_copy)
        
        edge_impacts[(u, v)] = {
            health_loss: impact,
            from_node: u,
            to_node: v,
            crosses_layers: G.nodes[u].layer != G.nodes[v].layer,
            weight: edge.weight
        }
    
    return sorted(edge_impacts, by=health_loss, descending)
```

---

## Algorithm 3: Bridge Node Detection

**Question:** "Which nodes, if removed, split the network into disconnected pieces?"

```
function BRIDGE_NODE_DETECTION(G):
    bridges = []
    
    G_undirected = to_undirected(G)
    baseline_components = count_connected_components(G_undirected)
    
    for each node v in G:
        G_test = copy(G_undirected)
        G_test.remove_node(v)
        
        if len(G_test.nodes) == 0:
            continue
            
        new_components = count_connected_components(G_test)
        
        if new_components > baseline_components:
            // v is a bridge node
            component_sizes = [len(c) for c in connected_components(G_test)]
            smallest_fragment = min(component_sizes)
            largest_fragment = max(component_sizes)
            
            bridges.append({
                node: v.id,
                splits_into: new_components,
                smallest_fragment_size: smallest_fragment,
                largest_fragment_size: largest_fragment,
                fragmentation_score: 1 - (largest_fragment / (len(G.nodes) - 1)),
                layer: v.layer
            })
    
    return sorted(bridges, by=fragmentation_score, descending)
```

**Fragmentation score:** 0 = removing the node barely fragments anything. 1 = removing the node splits the network into many equal pieces (maximum fragmentation).

---

## Algorithm 4: Cluster Detection

**Question:** "Which groups of nodes form tightly connected units that could be isolated?"

```
function CLUSTER_DETECTION(G):
    // Use Louvain community detection
    G_undirected = to_undirected_weighted(G)
    communities = louvain_communities(G_undirected)
    
    cluster_analysis = []
    
    for each community C in communities:
        // Internal strength: average edge weight within cluster
        internal_edges = [(u,v,w) for (u,v,w) in G.edges 
                          if u in C and v in C]
        internal_strength = mean([w for _,_,w in internal_edges]) 
                           if internal_edges else 0
        
        // External strength: average edge weight connecting to outside
        external_edges = [(u,v,w) for (u,v,w) in G.edges 
                          if (u in C) != (v in C)]
        external_strength = mean([w for _,_,w in external_edges]) 
                           if external_edges else 0
        
        // Boundary nodes: nodes in C that have external connections
        boundary = [n for n in C if any(
            (n, v) in G.edges or (v, n) in G.edges 
            for v in G.nodes if v not in C
        )]
        
        // Isolation risk: high internal, low external = easily isolated
        isolation_risk = (internal_strength / external_strength) 
                        if external_strength > 0 else float('inf')
        
        // Cluster θ: combined importance
        cluster_theta = sum(G.nodes[n].theta for n in C)
        
        // Cluster health impact if entire cluster dies
        cluster_impact = cluster_theta / sum(n.theta for n in G.nodes)
        
        // Layer composition
        layer_distribution = Counter(G.nodes[n].layer for n in C)
        
        cluster_analysis.append({
            nodes: list(C),
            size: len(C),
            internal_strength: internal_strength,
            external_strength: external_strength,
            isolation_risk: isolation_risk,
            boundary_nodes: boundary,
            boundary_count: len(boundary),
            cluster_theta: cluster_theta,
            cluster_impact: cluster_impact,
            layer_distribution: dict(layer_distribution),
            recovery_cost: sum(G.nodes[n].r for n in C)
        })
    
    return sorted(cluster_analysis, by=isolation_risk, descending)
```

---

## Algorithm 5: Compound Vulnerability Pairs

**Question:** "Which pairs of nodes, when both fail, cause disproportionately more damage than either alone?"

```
function COMPOUND_VULNERABILITY_PAIRS(G, top_k=20):
    // Only test top-k nodes by individual impact (to keep tractable)
    top_nodes = NODE_IMPACT_RANKING(G)[:top_k]
    
    pairs = []
    
    for i in range(len(top_nodes)):
        for j in range(i+1, len(top_nodes)):
            node_a = top_nodes[i].id
            node_b = top_nodes[j].id
            
            // Individual impacts (already computed)
            impact_a = top_nodes[i].health_loss
            impact_b = top_nodes[j].health_loss
            
            // Combined impact
            G_copy = deep_copy(G)
            G_copy.nodes[node_a].h = 0
            G_copy.nodes[node_a].φ = true
            G_copy.nodes[node_b].h = 0
            G_copy.nodes[node_b].φ = true
            _, final_state, metrics = CASCADE(G_copy, null)
            impact_combined = metrics.health_loss
            
            // Synergy: how much worse is combined vs sum of individual
            expected_combined = impact_a + impact_b
            synergy = impact_combined - expected_combined
            
            // Synergy ratio: >1 means super-additive
            synergy_ratio = impact_combined / max(expected_combined, 0.001)
            
            pairs.append({
                node_a: node_a,
                node_b: node_b,
                impact_a: impact_a,
                impact_b: impact_b,
                impact_combined: impact_combined,
                synergy: synergy,
                synergy_ratio: synergy_ratio,
                same_layer: G.nodes[node_a].layer == G.nodes[node_b].layer,
                same_cluster: in_same_community(node_a, node_b)
            })
    
    return sorted(pairs, by=synergy, descending)
```

**Interpretation:**
- synergy > 0: These two nodes protect each other. Losing both is catastrophic.
- synergy ≈ 0: Independent failures. No interaction.
- synergy < 0: Redundant nodes. Losing both is less than expected (one was already compensating for the other).

**Complexity:** O(top_k² × cascade_cost). With top_k=20: 190 cascade computations.

---

## Algorithm 6: Layer Dependency Analysis

**Question:** "Which layers depend on which other layers, and how autonomous is each?"

```
function LAYER_DEPENDENCY_ANALYSIS(G):
    layers = G.layers
    analysis = {}
    
    for each layer α in layers:
        nodes_in_alpha = [n for n in G.nodes if n.layer == α]
        
        // Count edge weights by direction
        internal_weight = sum(
            w for (u, v, w) in G.edges 
            if u.layer == α and v.layer == α
        )
        
        incoming_weight = {}    // from other layers INTO α
        outgoing_weight = {}    // from α TO other layers
        
        for each layer β ≠ α:
            incoming_weight[β] = sum(
                w for (u, v, w) in G.edges 
                if u.layer == β and v.layer == α
            )
            outgoing_weight[β] = sum(
                w for (u, v, w) in G.edges 
                if u.layer == α and v.layer == β
            )
        
        total_incoming = sum(incoming_weight.values())
        total_outgoing = sum(outgoing_weight.values())
        total_all = internal_weight + total_incoming
        
        // Autonomy: what fraction of layer α's dependencies are internal
        autonomy = internal_weight / total_all if total_all > 0 else 1.0
        
        // Criticality: how much do OTHER layers depend on α
        all_external_weight = sum(
            w for (u, v, w) in G.edges if u.layer != v.layer
        )
        criticality = total_outgoing / all_external_weight if all_external_weight > 0 else 0
        
        // Vulnerability: low autonomy + low θ average = fragile layer
        avg_theta = mean(n.theta for n in nodes_in_alpha)
        avg_recovery = mean(n.r for n in nodes_in_alpha)
        
        analysis[α] = {
            node_count: len(nodes_in_alpha),
            internal_weight: internal_weight,
            incoming_from: incoming_weight,     // {layer: weight}
            outgoing_to: outgoing_weight,       // {layer: weight}
            autonomy: autonomy,                 // [0, 1]
            criticality: criticality,           // [0, 1]
            avg_theta: avg_theta,
            avg_recovery: avg_recovery,
            layer_health: Hᵅ(G),
            
            // Derived risk score
            risk_score: (1 - autonomy) × criticality × avg_theta
        }
    
    return analysis
```

---

## Vulnerability Report (Combined Output)

All algorithms produce a single structured report:

```python
VulnerabilityReport = {
    "network_health": H(G),                    // Overall health score
    
    "node_rankings": [                         // Algorithm 1
        {id, health_loss, cascade_size, cascade_depth, 
         recovery_cost, layers_affected}
    ],
    
    "critical_edges": [                        // Algorithm 2
        {from_node, to_node, health_loss, 
         crosses_layers, weight}
    ],
    
    "bridge_nodes": [                          // Algorithm 3
        {node, splits_into, fragmentation_score, layer}
    ],
    
    "clusters": [                              // Algorithm 4
        {nodes, size, isolation_risk, boundary_nodes,
         cluster_impact, layer_distribution}
    ],
    
    "compound_pairs": [                        // Algorithm 5
        {node_a, node_b, impact_combined, synergy, 
         synergy_ratio, same_layer}
    ],
    
    "layer_analysis": {                        // Algorithm 6
        "layer_name": {autonomy, criticality, risk_score, ...}
    },
    
    "summary_stats": {
        "total_nodes": n,
        "total_edges": |E|,
        "total_layers": |L|,
        "most_critical_node": node_id,
        "most_fragile_layer": layer_name,
        "highest_synergy_pair": (node_a, node_b),
        "bridge_count": count,
        "cluster_count": count
    }
}
```

This report is the input to Module 3 (Agent Briefing).
