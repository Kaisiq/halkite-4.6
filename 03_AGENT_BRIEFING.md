# Module 3 — Agent Briefing

## Purpose

Transform the vulnerability report (Module 2 output) into targeted attack briefs for each agent. This is a deterministic mapping — no AI, no randomness. Each agent type receives a filtered, prioritized subset of the vulnerability data that matches its exploration strategy.

---

## Input

`VulnerabilityReport` from Module 2.

## Output

One `AgentBrief` per agent, containing:

```
AgentBrief = {
    agent_type: string,
    priority_targets: [node_ids],        // Ordered list of nodes to attack first
    priority_edges: [(from, to)],        // Ordered list of edges to cut first  
    focus_layers: [layer_names],         // Which layers to focus on
    focus_clusters: [cluster_indices],   // Which clusters to target
    initial_events: [Event],             // Suggested first moves
    max_depth: int,                      // How deep to explore
    branching_factor: int,               // How many branches per level
}
```

---

## Agent Type Definitions and Briefing Logic

### Agent 1: Critical Node Attacker

**Strategy:** Always kill the highest-impact surviving node.

```
function BRIEF_CRITICAL_NODE_ATTACKER(report):
    return AgentBrief {
        agent_type: "critical_node_attacker",
        
        priority_targets: report.node_rankings
            .sorted_by(health_loss, descending)
            .take(10)
            .map(n => n.id),
        
        priority_edges: [],    // This agent targets nodes, not edges
        
        focus_layers: [],      // All layers
        
        focus_clusters: [],    // Not cluster-focused
        
        initial_events: [
            {target: top_node.id, action: "kill"}
            for top_node in report.node_rankings[:3]
        ],
        
        max_depth: 5,
        branching_factor: 3    // Top 3 remaining nodes at each level
    }
```

### Agent 2: Bridge Breaker

**Strategy:** Target nodes that fragment the network into disconnected pieces.

```
function BRIEF_BRIDGE_BREAKER(report):
    if len(report.bridge_nodes) == 0:
        // No bridge nodes — fall back to critical edges
        return AgentBrief {
            agent_type: "bridge_breaker",
            priority_targets: [],
            priority_edges: report.critical_edges
                .sorted_by(health_loss, descending)
                .take(10)
                .map(e => (e.from_node, e.to_node)),
            initial_events: [
                {target: {from: e.from_node, to: e.to_node}, 
                 action: "cut_edge"}
                for e in report.critical_edges[:3]
            ],
            max_depth: 5,
            branching_factor: 3
        }
    
    return AgentBrief {
        agent_type: "bridge_breaker",
        
        priority_targets: report.bridge_nodes
            .sorted_by(fragmentation_score, descending)
            .take(10)
            .map(b => b.node),
        
        priority_edges: report.critical_edges
            .filter(e => e.crosses_layers)
            .take(5)
            .map(e => (e.from_node, e.to_node)),
        
        focus_layers: [],
        focus_clusters: [],
        
        initial_events: [
            {target: b.node, action: "kill"}
            for b in report.bridge_nodes[:3]
        ],
        
        max_depth: 4,
        branching_factor: 3
    }
```

### Agent 3: Compound Exploiter

**Strategy:** Attack pairs of nodes with highest synergy — two failures that together are catastrophic.

```
function BRIEF_COMPOUND_EXPLOITER(report):
    top_pairs = report.compound_pairs
        .filter(p => p.synergy > 0)
        .sorted_by(synergy, descending)
        .take(10)
    
    return AgentBrief {
        agent_type: "compound_exploiter",
        
        priority_targets: unique_nodes_from(top_pairs),
        
        priority_edges: [],
        
        focus_layers: [],
        focus_clusters: [],
        
        initial_events: [
            // Each initial event is a PAIR kill
            {target: [p.node_a, p.node_b], action: "kill"}
            for p in top_pairs[:3]
        ],
        
        max_depth: 4,          // Starts at depth 2 (pair), explores 2 more
        branching_factor: 4
    }
```

### Agent 4: Layer Assassin

**Strategy:** Identify the weakest/most critical layer and systematically destroy it.

```
function BRIEF_LAYER_ASSASSIN(report):
    // Find most critical layer with lowest autonomy
    // (high impact if attacked, and dependent on others)
    layer_scores = {
        layer: analysis.criticality × (1 - analysis.autonomy)
        for layer, analysis in report.layer_analysis
    }
    target_layer = max(layer_scores, by=value)
    
    // Get nodes in target layer, sorted by θ descending
    layer_nodes = [n for n in report.node_rankings 
                   if G.nodes[n.id].layer == target_layer]
    layer_nodes.sort_by(theta, descending)
    
    return AgentBrief {
        agent_type: "layer_assassin",
        
        priority_targets: layer_nodes.take(10).map(n => n.id),
        
        priority_edges: report.critical_edges
            .filter(e => e.from_layer == target_layer 
                      or e.to_layer == target_layer)
            .take(5),
        
        focus_layers: [target_layer],
        
        focus_clusters: [],
        
        initial_events: [
            {target: n.id, action: "kill"}
            for n in layer_nodes[:2]
        ],
        
        max_depth: 6,          // Deeper — systematically dismantling
        branching_factor: 2    // Narrower — focused on one layer
    }
```

### Agent 5: Cluster Isolator

**Strategy:** Cut the connections that link vulnerable clusters to the rest of the network.

```
function BRIEF_CLUSTER_ISOLATOR(report):
    // Target clusters with high isolation risk (easy to cut off)
    // and high cluster_impact (worth cutting off)
    target_clusters = report.clusters
        .sorted_by(isolation_risk × cluster_impact, descending)
        .take(5)
    
    // For each target cluster, find the boundary edges
    target_edges = []
    for cluster in target_clusters:
        boundary_edges = [
            (u, v) for (u, v, w) in G.edges
            if (u in cluster.nodes) != (v in cluster.nodes)
        ]
        // Sort boundary edges by weight — cut strongest first
        boundary_edges.sort_by(weight, descending)
        target_edges.extend(boundary_edges[:3])
    
    return AgentBrief {
        agent_type: "cluster_isolator",
        
        priority_targets: flatten(
            c.boundary_nodes for c in target_clusters
        ),
        
        priority_edges: target_edges,
        
        focus_layers: [],
        
        focus_clusters: [i for i, _ in enumerate(target_clusters)],
        
        initial_events: [
            {target: {from: e[0], to: e[1]}, action: "cut_edge"}
            for e in target_edges[:3]
        ],
        
        max_depth: 4,
        branching_factor: 4
    }
```

---

## Briefing Generation Function

```
function GENERATE_ALL_BRIEFS(report):
    return [
        BRIEF_CRITICAL_NODE_ATTACKER(report),
        BRIEF_BRIDGE_BREAKER(report),
        BRIEF_COMPOUND_EXPLOITER(report),
        BRIEF_LAYER_ASSASSIN(report),
        BRIEF_CLUSTER_ISOLATOR(report),
    ]
```

---

## Adaptive Briefing

After agents complete their first exploration pass, briefs can be regenerated based on discoveries:

```
function REBRIEFING(report, tree_results):
    // If agents found that certain "low-risk" nodes 
    // actually cause massive cascades when combined 
    // with other failures:
    
    surprising_nodes = tree_results
        .filter(scenario => any node in scenario.path 
                not in report.node_rankings[:10])
    
    // Add these surprising nodes to priority targets 
    // for a second exploration pass
    
    for agent in agents:
        agent.brief.priority_targets.extend(surprising_nodes)
        agent.brief.max_depth += 1  // Go deeper on second pass
```

This is optional for the hackathon but powerful for production.
