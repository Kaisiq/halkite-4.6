# Reference Signals

## Purpose

Capture the strongest frontend/product patterns from the two reference systems and translate them into actionable design rules for Achilles.

## Reference 1: Contrast Graph

### Strong signals

- The product is framed as a live graph model, not a static report.
- The system emphasizes continuous mapping, context correlation, and runtime precision.
- The graph is presented as the center of truth, with risk layered on top of it.
- Risk appears contextual, not isolated. Assets, routes, behaviors, attacks, and business importance are shown as part of one model.

### What to borrow

- Treat the Achilles graph as the primary interface, not a supporting widget.
- Make every risk item traceable to a visible path, layer, or dependency relation.
- Use a live-system feel: streaming updates, active states, dynamic ranking, changing severity.
- Show business context next to technical context instead of splitting them into separate screens.

### What not to copy

- Do not make the product look like an AppSec tool.
- Do not overload the first screen with too many entity types.
- Do not bury the narrative; Achilles needs clearer scenario storytelling than a security operations console.

## Reference 2: Cye Attack Route Visualization

### Strong signals

- The system is framed around attack routes to critical business assets.
- The messaging is mitigation-oriented: identify chokepoints, quantify likelihood, and show progress over time.
- The graph is valuable because it helps users decide what to block first.
- The business framing is strong: critical assets, financial impact, mitigation priorities.

### What to borrow

- Make worst-case path discovery the core emotional moment of the product.
- Rank findings by intervention value, not only by mathematical severity.
- Show how one defensive action changes multiple outcomes.
- Support alternate scenarios and comparisons over time.

### What not to copy

- Do not turn Achilles into a cybersecurity-only product.
- Do not rely on generic “exposure management” language.
- Do not reduce the UI to a list of findings with a graph thumbnail.

## Combined design takeaway

Achilles should feel like a business-critical simulation cockpit:

- graph-first like Contrast
- path-and-chokepoint legibility like Cye
- clearer step-by-step scenario storytelling than either reference

## Product rules derived from the references

1. The graph must always remain visible somewhere in the experience.
2. Every ranked result must link to a visible path, cascade, or node cluster.
3. The UI must connect technical structure to business damage in one view.
4. The best intervention should be obvious in under 10 seconds.
5. Exploration should feel active and computational, not like a static dashboard refresh.

## Sources

- Contrast Graph: https://www.contrastsecurity.com/contrast-graph
- Cye Attack Route Visualization: https://cyesec.com/product/attack-route-visualization

## Notes From Sources

From Contrast, the design guidance above is based on the product being presented as a real-time security data model that maps and correlates applications, APIs, infrastructure, routes, blast radius, business importance, and dynamic risk scoring. Source: https://www.contrastsecurity.com/contrast-graph

From Cye, the design guidance above is based on the product positioning around visualizing exposure from threat sources to critical business assets, identifying chokepoints with graph theory, estimating likelihood of attacker reach, and tracking mitigation progress over time. Source: https://cyesec.com/product/attack-route-visualization
