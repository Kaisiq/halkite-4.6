# Module 6 — Frontend

## Purpose

React application with D3.js visualizations. Four main screens that correspond to the four pipeline steps.

---

## Tech

```
Framework: React 18+ (Vite or Create React App)
Visualization: D3.js (force-directed graph), Recharts (charts/dashboards)
Styling: Tailwind CSS
State: React Context or Zustand
API calls: fetch or axios
```

---

## Screen 1: Data Input

**Route:** `/`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Halkantir — Organizational Stress Testing              │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │                                           │  │
│  │   Drag & drop your files here             │  │
│  │   or click to browse                      │  │
│  │                                           │  │
│  │   PDF, DOCX, XLSX, CSV, images            │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Describe your organization (optional):   │  │
│  │  ________________________________________│  │
│  │  ________________________________________│  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  [Uploaded files list with status indicators]   │
│                                                 │
│  [ Build Network → ]                            │
│                                                 │
│  [Loading state: "Analyzing documents...",      │
│   "Extracting entities...",                     │
│   "Building dependency graph..."]               │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Interactions:**
- Drag-drop or click-to-upload files
- Optional text description textarea
- "Build Network" button → calls POST /api/upload
- Loading state with progress messages
- On success → navigate to Screen 2
- If follow_up_questions returned → show as quick prompts before proceeding

---

## Screen 2: Network View + Analysis

**Route:** `/network/{session_id}`

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  Halkantir [Network] [Simulate] [Scenarios] [Report]         │
├──────────────────────────────────────────────────────────────┤
│                                          │                   │
│                                          │  ANALYSIS PANEL   │
│                                          │                   │
│     D3 FORCE-DIRECTED GRAPH              │  Network Health   │
│                                          │  H = 1.00         │
│     ○ People (blue)                      │                   │
│     ○ Technology (green)                 │  Layer Health      │
│     ○ Supply (orange)                    │  People:    1.00   │
│     ○ Financial (yellow)                 │  Tech:      1.00   │
│     ○ Facilities (red)                   │  Supply:    1.00   │
│     ○ Operations (purple)               │                   │
│                                          │  Top Risks         │
│     Nodes sized by θ                     │  1. CEO (0.72)     │
│     Edges thickness by weight            │  2. AWS (0.45)     │
│     Layer toggle checkboxes              │  3. Flour (0.38)   │
│                                          │                   │
│                                          │  Bridges: 2        │
│                                          │  Clusters: 4       │
│                                          │  Fragility: 3.2x   │
│                                          │                   │
│                                          │  [Run Analysis →]  │
│                                          │  [Start Sim →]     │
│                                          │                   │
└──────────────────────────────────────────────────────────────┘
```

**D3 Graph Visualization:**

```
Node rendering:
- Circle radius proportional to θ (importance)
- Color by layer
- Opacity proportional to h (health)
- Stroke: red if φ = true (failed), normal otherwise
- Label: node name (show on hover, always show for θ > 0.5)

Edge rendering:
- Line thickness proportional to weight
- Color: gray default, red during cascade
- Dashed if crosses layers
- Arrow showing direction (from → to)

Interactions:
- Drag nodes to rearrange
- Click node: show details panel (h, θ, r, connections)
- Hover node: highlight all connected edges
- Scroll to zoom
- Layer toggle: show/hide nodes by layer
- Click "Kill Node" button when node selected → runs cascade
```

**Analysis Panel:**
- Shows vulnerability report summary
- "Run Analysis" button → calls POST /api/analyze
- After analysis: shows node rankings, bridges, clusters, layer risks
- Click any risk item → highlights it on the graph

---

## Screen 3: Simulation (State Tree Exploration)

**Route:** `/simulate/{session_id}`

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  Halkantir [Network] [Simulate] [Scenarios] [Report]         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  AGENT CONTROL                                               │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│  │Agent1│ │Agent2│ │Agent3│ │Agent4│ │Agent5│              │
│  │ ✓    │ │ ✓    │ │ ✓    │ │ ✓    │ │ ✓    │              │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘              │
│                                                              │
│  Depth: [===5===]    Tree limit: [===5000===]               │
│                                                              │
│  [ Run Exploration → ]                                       │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                               │                              │
│  STATE TREE VISUALIZATION     │  LIVE PROGRESS               │
│                               │                              │
│       [root H=1.0]            │  Nodes explored: 2847        │
│      /     |      \           │  Max depth: 5                │
│   [0.72] [0.78] [0.85]       │  Current worst: H=0.08       │
│   /   \    |                  │                              │
│ [0.31] [0.55] ...            │  Agent 1: ████████░░ 80%     │
│                               │  Agent 2: ██████░░░░ 60%     │
│                               │  Agent 3: ████░░░░░░ 40%     │
│  Click any tree node to       │  Agent 4: ██░░░░░░░░ 20%     │
│  see its state on the graph   │  Agent 5: █░░░░░░░░░ 10%     │
│                               │                              │
└──────────────────────────────────────────────────────────────┘
```

**State Tree Visualization:**
- D3 tree layout (top-down or radial)
- Node color by H value (green → yellow → red)
- Node size by cascade_size
- Edge labeled with event name
- Click tree node → shows the network graph in that state
- Highlight worst path in red

**Live Progress:**
- WebSocket connection to /ws/explore
- Real-time counters and progress bars per agent
- "New worst found!" flash when a worse scenario is discovered

---

## Screen 4: Scenarios & Report

**Route:** `/report/{session_id}`

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  Halkantir [Network] [Simulate] [Scenarios] [Report]         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  WORST-CASE SCENARIOS                                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  #1 — "The Leadership Collapse"  [CRITICAL]            │  │
│  │  H: 1.00 → 0.08 | 11/16 nodes failed | Recovery: 450k│  │
│  │                                                        │  │
│  │  Step 1: CEO leaves → H drops to 0.72                 │  │
│  │  Step 2: CTO follows → H drops to 0.31 (cascade: +3) │  │
│  │  Step 3: Server unmanaged → H drops to 0.08           │  │
│  │                                                        │  │
│  │  [▶ Play Cascade Animation]  [View on Graph]           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  #2 — "The Supply Chain Collapse"  [HIGH]              │  │
│  │  H: 1.00 → 0.22 | 8/16 nodes failed | Recovery: 120k │  │
│  │  ...                                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ... (top 10 scenarios)                                      │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  RECOMMENDATIONS                                             │
│                                                              │
│  Priority 1: Hire backup CTO (prevents 7/10 scenarios)      │
│  Priority 2: Second flour supplier (prevents 4/10)          │
│  Priority 3: Document server admin procedures               │
│                                                              │
│  [Export Report as PDF]                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Cascade Animation:**
- When user clicks "Play Cascade Animation"
- The network graph from Screen 2 replays the cascade
- Nodes change color/opacity as health decreases
- Failed nodes turn red and shrink
- Edges from failed nodes fade out
- Step-by-step with play/pause/speed controls
- Timeline scrubber at bottom

**Scenario Cards:**
- Expandable cards showing each worst-case scenario
- AI-generated narrative
- Step-by-step cascade breakdown
- "View on Graph" button → switches to Screen 2 in that state
- Color-coded severity labels

---

## Component Hierarchy

```
App
├── DataInputPage
│   ├── FileDropZone
│   ├── DescriptionTextarea
│   ├── FileList
│   ├── FollowUpQuestions
│   └── BuildButton
│
├── NetworkPage
│   ├── GraphCanvas (D3)
│   │   ├── NodeRenderer
│   │   ├── EdgeRenderer
│   │   ├── LayerToggles
│   │   └── ZoomControls
│   ├── AnalysisPanel
│   │   ├── HealthScore
│   │   ├── LayerHealthBars
│   │   ├── NodeRankingList
│   │   ├── BridgeList
│   │   └── ClusterList
│   └── NodeDetailPanel
│
├── SimulationPage
│   ├── AgentControls
│   ├── ConfigSliders
│   ├── TreeVisualization (D3)
│   ├── ProgressPanel
│   └── LiveFeed
│
└── ReportPage
    ├── ScenarioList
    │   └── ScenarioCard
    │       ├── SeverityBadge
    │       ├── StepTimeline
    │       ├── CascadePlayer
    │       └── NarrativeText
    ├── RecommendationList
    └── ExportButton
```

---

## Key D3 Implementation Notes

### Force-Directed Graph

```javascript
const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id(d => d.id)
        .distance(d => 100 / d.weight))        // Stronger links = closer
    .force("charge", d3.forceManyBody()
        .strength(d => -100 * d.theta))         // Important nodes repel more
    .force("center", d3.forceCenter(width/2, height/2))
    .force("collision", d3.forceCollide()
        .radius(d => 10 + d.theta * 30))        // Size by importance

// Node radius
const nodeRadius = d => 5 + d.theta * 25

// Node color
const layerColors = {
    "People": "#3B82F6",
    "Technology": "#10B981",
    "Supply": "#F59E0B",
    "Financial": "#EAB308",
    "Facilities": "#EF4444",
    "Operations": "#8B5CF6"
}

// Health-based opacity
const nodeOpacity = d => 0.2 + d.h * 0.8

// Failed node styling
const nodeStroke = d => d.phi ? "#DC2626" : "#374151"
const nodeStrokeWidth = d => d.phi ? 3 : 1
```

### Cascade Animation

```javascript
function animateCascade(frames, speed = 500) {
    let frameIndex = 0
    
    const interval = setInterval(() => {
        if (frameIndex >= frames.length) {
            clearInterval(interval)
            return
        }
        
        const frame = frames[frameIndex]
        
        // Update node visuals
        nodes.forEach(node => {
            node.h = frame.node_healths[node.id]
            node.phi = frame.node_failed[node.id]
        })
        
        // D3 transition
        d3.selectAll(".node circle")
            .transition()
            .duration(speed * 0.8)
            .attr("r", d => nodeRadius(d))
            .attr("opacity", d => nodeOpacity(d))
            .attr("stroke", d => nodeStroke(d))
        
        // Flash newly failed nodes
        const newlyFailed = frame.newly_failed || []
        d3.selectAll(".node circle")
            .filter(d => newlyFailed.includes(d.id))
            .transition()
            .duration(200)
            .attr("fill", "#DC2626")
            .attr("r", d => nodeRadius(d) * 1.5)
            .transition()
            .duration(300)
            .attr("r", d => nodeRadius(d))
        
        frameIndex++
    }, speed)
}
```
