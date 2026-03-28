# Screen Blueprints

## Goal

Define how the actual MVP frontend should present the product so the graph, simulations, and ranked scenarios feel impressive and easy to understand.

## 1. Landing / Upload

### Job

Make the product understandable in one glance.

### Must show

- One-sentence value proposition
- Upload entry
- Short pipeline preview
- Strong visual hint of the graph and scenario engine

### Recommended composition

- Left: product statement and call to action
- Right: stylized graph preview with animated path pulses
- Below: four-step pipeline strip

### Rule

This screen should promise: upload your organization, reveal catastrophic dependencies.

## 2. Network View

### Job

Establish trust in the graph model.

### Must show

- Main graph canvas
- Network health
- Layer health
- Top weakpoints
- Selected node/edge details

### Recommended composition

- Center-left: large graph canvas
- Right rail: analysis panel
- Bottom tray or expandable panel: selected item details and actions

### Interaction priority

1. Hover node
2. Inspect relationships
3. Highlight risk item from panel
4. Run analysis

### Rule

The graph should feel like the source of truth for everything that follows.

## 3. Simulation / Exploration

### Job

Deliver the strongest jury moment.

### Must show

- Active exploration status
- Agent identities
- Current worst case
- Growing state tree
- Graph state linked to selected tree node

### Recommended composition

- Left: state tree
- Center: graph in selected state
- Right: live feed and agent progress
- Top: run controls and current worst summary

### Key dramatic moments

- agent started
- new worst found
- path becomes highlighted
- H drops sharply after cascade

### Rule

This page must feel computational and adversarial, not static.

## 4. Scenarios / Report

### Job

Translate math into memorable decisions.

### Must show

- Top scenarios ranked by severity
- Named scenario labels
- Step-by-step collapse sequence
- Recovery cost / impact
- Top prevention recommendations

### Recommended composition

- Top: featured worst scenario
- Middle: scenario stack with expand/collapse
- Right or bottom: interventions ranked by prevented damage

### Rule

The user should leave this page knowing exactly what to fix first.

## Cross-screen design rules

- Keep the active session identity visible.
- Preserve a persistent notion of current network health.
- Make transitions between graph, tree, and scenario cards feel connected.
- Use the same colors for node states everywhere.
- Do not hide the graph once the user moves deeper into the workflow.

## MVP build priority

1. Landing with strong product framing
2. Network graph with analysis rail
3. Simulation page with live progress presentation
4. Report page with named scenarios and recommendations

## Sources

- Contrast Graph: https://www.contrastsecurity.com/contrast-graph
- Cye Attack Route Visualization: https://cyesec.com/product/attack-route-visualization
