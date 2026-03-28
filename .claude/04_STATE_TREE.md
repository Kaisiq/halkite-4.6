# Module 4 — State Tree

## Purpose

The state tree is the data structure that stores all explored failure scenarios. It is a rooted tree where each node represents a network state and each edge represents an event that transforms one state into another. Multiple agents explore this tree concurrently, building different branches based on their strategies.

---

## Data Structure

### Tree Node

```
TreeNode = {
    id:           string          — unique identifier (uuid)
    state:        State           — network state snapshot (h[], φ[], H, Hᵅ)
    parent:       TreeNode | null — null for root
    children:     [TreeNode]      — branches explored from this state
    event:        Event | null    — the event that produced this state (null for root)
    agent:        string          — which agent created this branch
    depth:        int             — distance from root (root = 0)
    
    // Metrics at this node
    H:            float           — network health at this state
    delta_H:      float           — health lost from parent: parent.H - this.H
    cumulative_loss: float        — total health lost from root: root.H - this.H
    failed_count: int             — total nodes failed at this state
    recovery_cost: float          — total cost to restore all failed nodes
    
    // Backpropagated from descendants
    worst_descendant_H: float     — lowest H found in any descendant
    worst_path:         [Event]   — sequence of events to reach worst descendant
}
```

### Tree

```
StateTree = {
    root:         TreeNode        — initial state, H = 1.0
    all_nodes:    [TreeNode]      — flat list of all tree nodes for indexing
    worst_scenarios: [TreeNode]   — top-k worst leaf nodes, sorted by H ascending
    
    // Stats
    total_nodes_explored: int
    max_depth_reached:    int
    agents_used:          [string]
}
```

---

## Tree Construction Algorithm

```
function BUILD_STATE_TREE(G, agents, config):
    
    Input:
        G = graph (from Module 1)
        agents = list of Agent objects with briefs (from Module 3)
        config = {
            max_depth: int (default 5),
            max_tree_nodes: int (default 5000),
            worst_k: int (default 10)
        }
    
    // Initialize
    root_state = snapshot(G)  // All h = 1.0, all φ = false
    root = TreeNode {
        id: uuid(),
        state: root_state,
        parent: null,
        children: [],
        event: null,
        agent: "root",
        depth: 0,
        H: H(G),
        delta_H: 0,
        cumulative_loss: 0,
        failed_count: 0,
        recovery_cost: 0,
        worst_descendant_H: H(G),
        worst_path: []
    }
    
    tree = StateTree {
        root: root,
        all_nodes: [root],
        worst_scenarios: [],
        total_nodes_explored: 1,
        max_depth_reached: 0,
        agents_used: [a.brief.agent_type for a in agents]
    }
    
    // Each agent explores from root
    for agent in agents:
        EXPLORE(tree, root, agent, config)
    
    // Collect worst scenarios
    leaves = [n for n in tree.all_nodes if len(n.children) == 0]
    tree.worst_scenarios = sorted(leaves, by=H, ascending)[:config.worst_k]
    
    // Backpropagate worst scores
    BACKPROPAGATE(tree)
    
    return tree
```

---

## Exploration Algorithm

```
function EXPLORE(tree, parent_node, agent, config):
    
    if parent_node.depth >= config.max_depth:
        return    // Maximum depth reached
    
    if tree.total_nodes_explored >= config.max_tree_nodes:
        return    // Tree size limit reached
    
    if parent_node.H <= 0.05:
        return    // Network is effectively dead, stop exploring
    
    // Ask agent for events to explore
    events = agent.select_events(parent_node.state, parent_node.depth)
    
    for event in events:
        // Apply event to a copy of the state
        G_copy = rebuild_graph_from_state(parent_node.state)
        cascade_log, new_state, metrics = CASCADE(G_copy, event)
        
        // Check for duplicate states (pruning)
        if is_duplicate_state(tree, new_state):
            continue
        
        // Create new tree node
        child = TreeNode {
            id: uuid(),
            state: new_state,
            parent: parent_node,
            children: [],
            event: event,
            agent: agent.brief.agent_type,
            depth: parent_node.depth + 1,
            H: H(new_state),
            delta_H: parent_node.H - H(new_state),
            cumulative_loss: 1.0 - H(new_state),
            failed_count: count(n for n in new_state if n.φ),
            recovery_cost: sum(n.r for n in new_state if n.φ),
            worst_descendant_H: H(new_state),
            worst_path: parent_node.worst_path + [event]
        }
        
        parent_node.children.append(child)
        tree.all_nodes.append(child)
        tree.total_nodes_explored += 1
        tree.max_depth_reached = max(tree.max_depth_reached, child.depth)
        
        // Recurse
        EXPLORE(tree, child, agent, config)
```

---

## Pruning Rules

### 1. Depth Limit
```
if depth >= max_depth: stop
```

### 2. Tree Size Limit
```
if total_nodes_explored >= max_tree_nodes: stop
```

### 3. Dead Network
```
if H <= 0.05: stop (network is effectively collapsed)
```

### 4. Duplicate State Detection
```
function is_duplicate_state(tree, new_state):
    for existing in tree.all_nodes:
        if states_equal(existing.state, new_state):
            return true
    return false

function states_equal(s1, s2):
    // Two states are equal if same nodes are dead
    // (health values may differ slightly due to floating point)
    return s1.φ == s2.φ  // Same failure pattern
```

This prevents the tree from exploring the same state from different paths.

### 5. Diminishing Returns
```
if delta_H < 0.01: 
    // This event barely changed anything
    // Deprioritize but don't skip entirely
    // (could lead to bigger cascades at next level)
    reduce branching_factor for this subtree
```

---

## Backpropagation

After all exploration is complete, propagate worst-case information up the tree:

```
function BACKPROPAGATE(tree):
    // Process leaves first, then up to root (post-order traversal)
    
    function backprop(node):
        if len(node.children) == 0:
            // Leaf node
            node.worst_descendant_H = node.H
            return
        
        for child in node.children:
            backprop(child)
        
        // This node's worst descendant is the minimum across all children
        worst_child = min(node.children, by=worst_descendant_H)
        
        if worst_child.worst_descendant_H < node.worst_descendant_H:
            node.worst_descendant_H = worst_child.worst_descendant_H
            node.worst_path = worst_child.worst_path
    
    backprop(tree.root)
```

After backpropagation, every node in the tree knows the worst possible outcome reachable from its state.

---

## Path Extraction

Extract the complete disaster story from root to a specific leaf:

```
function EXTRACT_PATH(leaf_node):
    path = []
    current = leaf_node
    
    while current.parent is not null:
        path.append({
            step: current.depth,
            event: current.event,
            agent: current.agent,
            H_before: current.parent.H,
            H_after: current.H,
            delta_H: current.delta_H,
            new_failures: [n for n in current.state 
                          if n.φ and not current.parent.state.nodes[n.id].φ],
            recovery_cost_so_far: current.recovery_cost
        })
        current = current.parent
    
    path.reverse()  // Root-to-leaf order
    return path
```

---

## Tree Statistics

```
function TREE_STATS(tree):
    return {
        total_nodes: tree.total_nodes_explored,
        max_depth: tree.max_depth_reached,
        
        // Per-agent stats
        agent_stats: {
            agent_type: {
                nodes_explored: count,
                worst_H_found: min H across this agent's nodes,
                avg_delta_H: mean delta_H across this agent's nodes,
                unique_failures_found: set of node_ids that failed 
                                       in this agent's branches
            }
            for each agent
        },
        
        // Scenario distribution
        H_distribution: histogram of H values across all leaves,
        
        // Convergence: did agents find similar worst cases?
        worst_per_agent: {
            agent_type: worst leaf H for each agent
        },
        
        // How much of the tree was pruned
        prune_stats: {
            depth_limited: count,
            duplicate_pruned: count,
            dead_network_pruned: count,
            diminishing_returns: count
        }
    }
```

---

## Memory Efficiency

For large trees, store states efficiently:

```
// Don't store full state at every node
// Store only the DIFF from parent

TreeNode.state_diff = {
    changed_nodes: [
        {id, h_before, h_after, φ_before, φ_after}
    ]
}

// Reconstruct full state by walking from root
function reconstruct_state(node):
    if node.parent is null:
        return initial_state
    
    parent_state = reconstruct_state(node.parent)
    state = copy(parent_state)
    for change in node.state_diff.changed_nodes:
        state.nodes[change.id].h = change.h_after
        state.nodes[change.id].φ = change.φ_after
    return state
```

This reduces memory from O(tree_size × n) to O(tree_size × avg_changes_per_step).

For the hackathon with small graphs (< 100 nodes): store full states. Simpler.
