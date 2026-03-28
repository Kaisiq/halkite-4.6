# Module 4A — Results & Ranking

## Purpose

Take the explored state tree and produce the final output: ranked worst-case scenarios with AI-generated narratives, actionable recommendations, and data for visualization.

---

## Step 1: Scenario Extraction

From the state tree, extract all leaf nodes and rank by severity:

```
function EXTRACT_SCENARIOS(tree, top_k=10):
    
    leaves = [n for n in tree.all_nodes if len(n.children) == 0]
    
    // Score each leaf
    scored = []
    for leaf in leaves:
        path = EXTRACT_PATH(leaf)
        
        score = {
            // Primary: how much health was lost
            health_remaining: leaf.H,
            health_lost: 1.0 - leaf.H,
            
            // Secondary: how many nodes failed
            failed_count: leaf.failed_count,
            failed_fraction: leaf.failed_count / total_nodes,
            
            // Context: how deep and expensive
            depth: leaf.depth,
            recovery_cost: leaf.recovery_cost,
            
            // Which layers were affected
            layers_affected: unique([
                G.nodes[n.id].layer 
                for n in leaf.state if n.φ
            ]),
            layers_affected_count: len(layers_affected),
            
            // Cross-layer cascade count
            cross_layer_events: count(
                step for step in path 
                if any(n.layer != path[0].event.target.layer 
                       for n in step.new_failures)
            ),
            
            // Which agent found this
            agent: leaf.agent,
            
            // The full path
            path: path
        }
        
        // Composite severity score
        score.severity = (
            0.5 * score.health_lost +
            0.2 * score.failed_fraction +
            0.15 * (score.layers_affected_count / total_layers) +
            0.15 * min(1.0, score.recovery_cost / max_possible_recovery)
        )
        
        scored.append(score)
    
    // Deduplicate similar scenarios
    unique_scenarios = deduplicate(scored)
    
    // Sort by severity descending
    unique_scenarios.sort(by=severity, descending)
    
    return unique_scenarios[:top_k]
```

---

## Step 2: Deduplication

Two scenarios are considered duplicates if they result in the same set of failed nodes, even if the path to get there was different:

```
function deduplicate(scenarios):
    seen = set()
    unique = []
    
    for scenario in scenarios:
        failed_set = frozenset(
            n.id for n in scenario.path[-1].state if n.φ
        )
        
        if failed_set not in seen:
            seen.add(failed_set)
            unique.append(scenario)
        else:
            // Keep the one with shorter path (more realistic attack)
            existing = find(unique, by=failed_set)
            if scenario.depth < existing.depth:
                replace(existing, scenario)
    
    return unique
```

---

## Step 3: AI Narrative Generation

For each top scenario, send the mathematical results to Claude to generate a human-readable narrative:

```
AI PROMPT:

You are a risk analyst presenting findings to a business leader.
You will receive a mathematical analysis of a worst-case failure 
scenario for their organization's network. Translate it into a 
clear, actionable narrative.

SCENARIO DATA:
{scenario JSON}

GRAPH CONTEXT:
{node names, layers, relationships — enough context to understand 
what each node represents in the real world}

RULES:
- Lead with the business impact, not the math
- Use specific node names (e.g. "your head chef Dimitar" not "node_7")
- Describe the cascade as a story with a timeline
- Quantify damage in business terms (revenue, capacity, time)
- End with 2-3 specific, actionable recommendations
- Keep it to 1 paragraph per cascade step
- Reference the exact numbers from the analysis

OUTPUT FORMAT:
{
    "title": "Short scenario name (e.g. 'The Supply Chain Collapse')",
    "severity_label": "Critical | High | Medium | Low",
    "summary": "One sentence summary",
    "narrative": "Full story of the cascade",
    "timeline": [
        {"step": 1, "description": "What happens first"},
        {"step": 2, "description": "What happens next"},
        ...
    ],
    "business_impact": {
        "estimated_revenue_loss": "percentage or description",
        "recovery_time": "estimated time to full recovery",
        "affected_operations": ["list of affected areas"]
    },
    "recommendations": [
        {
            "action": "What to do",
            "cost_estimate": "Rough cost",
            "impact": "How much this improves resilience"
        }
    ]
}
```

---

## Step 4: Recommendations Generation

Based on all scenarios combined, generate overall recommendations:

```
function GENERATE_RECOMMENDATIONS(scenarios, vulnerability_report):
    
    // Count how often each node appears in worst scenarios
    failure_frequency = Counter()
    for scenario in scenarios:
        for step in scenario.path:
            for node in step.new_failures:
                failure_frequency[node.id] += 1
    
    // Nodes that appear in many worst scenarios = high priority to protect
    priority_nodes = failure_frequency.most_common(10)
    
    // For each priority node, recommend based on its properties
    recommendations = []
    
    for node_id, frequency in priority_nodes:
        node = G.nodes[node_id]
        
        if node.θ > 0.7 and no_redundancy(node):
            recommendations.append({
                type: "add_redundancy",
                target: node_id,
                reason: f"{node.name} appears in {frequency}/{len(scenarios)} "
                        f"worst scenarios with θ={node.θ} and no backup",
                action: f"Create a backup/alternative for {node.name}",
                estimated_resilience_gain: estimate_gain(node)
            })
        
        if is_bridge_node(node_id):
            recommendations.append({
                type: "add_bypass",
                target: node_id,
                reason: f"{node.name} is a bridge node — removing it "
                        f"fragments the network",
                action: f"Create alternative connections that bypass {node.name}",
                estimated_resilience_gain: estimate_gain(node)
            })
        
        if node.r > high_recovery_threshold:
            recommendations.append({
                type: "reduce_recovery_time",
                target: node_id,
                reason: f"{node.name} has recovery cost of {node.r} — "
                        f"too slow to restore",
                action: f"Prepare contingency plan to speed up "
                        f"recovery of {node.name}",
                estimated_resilience_gain: "Reduces downtime"
            })
    
    // Layer-level recommendations
    for layer, analysis in vulnerability_report.layer_analysis:
        if analysis.autonomy < 0.3:
            recommendations.append({
                type: "increase_layer_autonomy",
                target: layer,
                reason: f"{layer} layer has autonomy of only "
                        f"{analysis.autonomy:.0%} — almost entirely "
                        f"dependent on other layers",
                action: f"Build internal redundancy within {layer} layer",
                estimated_resilience_gain: "Major"
            })
    
    return recommendations
```

---

## Step 5: Final Output Structure

```python
FinalReport = {
    "metadata": {
        "timestamp": datetime,
        "graph_size": {"nodes": n, "edges": |E|, "layers": |L|},
        "tree_stats": TREE_STATS(tree),
        "r_unit": "days"         // Recovery cost unit
    },
    
    "network_health": {
        "overall": H(G),
        "per_layer": {layer: Hᵅ for each layer}
    },
    
    "vulnerability_summary": {
        "most_critical_node": {id, name, θ, impact},
        "most_fragile_layer": {name, autonomy, criticality},
        "bridge_count": int,
        "highest_synergy_pair": {nodes, synergy_ratio}
    },
    
    "worst_scenarios": [
        {
            "rank": 1,
            "severity": 0.92,
            "severity_label": "Critical",
            "title": "AI-generated title",
            "summary": "AI-generated one-liner",
            "health_remaining": 0.08,
            "failed_nodes": [list],
            "recovery_cost": 450000,
            "depth": 3,
            "agent": "compound_exploiter",
            "path": [
                {
                    "step": 1,
                    "event": Event,
                    "H_before": 1.0,
                    "H_after": 0.65,
                    "new_failures": [nodes],
                    "narrative": "AI-generated step description"
                },
                ...
            ],
            "narrative": "AI-generated full story",
            "recommendations": [...]
        },
        ...  // top 10 scenarios
    ],
    
    "recommendations": [
        {
            "priority": 1,
            "type": "add_redundancy",
            "target": "node_id",
            "action": "description",
            "reason": "why",
            "estimated_cost": float,
            "estimated_resilience_gain": "description",
            "scenarios_prevented": int  // how many worst scenarios this would prevent
        },
        ...
    ],
    
    // Raw data for frontend visualization
    "visualization_data": {
        "graph": G,                    // Full graph for D3 rendering
        "vulnerability_report": VulnerabilityReport,
        "state_tree": tree,            // For tree visualization
        "cascade_animations": [        // Pre-computed cascade steps for animation
            {
                "scenario_rank": 1,
                "frames": [
                    {
                        "step": 0,
                        "node_healths": {id: h},
                        "node_failed": {id: bool},
                        "event": Event
                    },
                    ...
                ]
            }
        ]
    }
}
```

---

## Cascade Animation Data

For the frontend to animate cascades, pre-compute frame-by-frame data:

```
function PRECOMPUTE_ANIMATION(scenario):
    frames = []
    
    // Frame 0: initial state
    G_anim = rebuild_graph(initial_state)
    frames.append({
        step: 0,
        node_healths: {n.id: n.h for n in G_anim.nodes},
        node_failed: {n.id: n.φ for n in G_anim.nodes},
        event: null,
        H: H(G_anim)
    })
    
    // For each step in the scenario path
    for step in scenario.path:
        // Apply event
        apply_event(G_anim, step.event)
        
        // Run cascade step by step (not to fixed point)
        // Each cascade step = one animation frame
        while cascade_has_more_steps:
            cascade_one_step(G_anim)
            
            frames.append({
                step: len(frames),
                node_healths: {n.id: n.h for n in G_anim.nodes},
                node_failed: {n.id: n.φ for n in G_anim.nodes},
                event: step.event if first_frame_of_step else null,
                H: H(G_anim),
                cascade_step: true
            })
    
    return frames
```

This gives the frontend a frame-by-frame animation: apply event → watch nodes turn red one by one → next event → more cascading.
