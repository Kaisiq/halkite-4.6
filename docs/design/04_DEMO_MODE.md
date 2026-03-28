# Demo Mode

## Purpose

Define how Halkantir should behave when presented live to a jury.

## Demo principle

The jury should feel three things in sequence:

1. This system builds a real dependency model.
2. It actively searches for catastrophic outcomes.
3. It tells me what to do about them.

## Demo posture

Prefer a guided presentation mode over a raw tool view.

That means:

- larger type
- stronger default zoom targets
- cleaner panels
- fewer low-value controls visible at once
- richer event animations

## What to emphasize

### During upload

- The system is constructing the graph.
- The graph spans layers, not just one department.

### During analysis

- Critical nodes and bridges are being ranked mathematically.
- This is not a hand-written report.

### During exploration

- Multiple agent strategies are searching different failure paths.
- The worst case can get updated live.

### During report

- Recommendations prevent specific scenarios, not generic risks.
- The system can justify why these interventions matter.

## Visual treatment for demo mode

- Increase panel contrast
- Increase graph label visibility for important nodes
- Increase animation clarity for failure propagation
- Reduce secondary UI chrome
- Surface one featured scenario at a time

## Suggested demo sequence

1. Start on the upload/landing screen.
2. Move immediately to a prebuilt graph.
3. Run analysis and highlight one obvious weakpoint.
4. Run exploration and wait for a new worst scenario event.
5. Open the top-ranked scenario and replay its cascade.
6. End on recommendations with a simple “fix these first” view.

## Things to avoid in the demo

- Showing too many controls at once
- Letting the graph become visually noisy
- Making the jury read dense text paragraphs
- Jumping between unrelated screens too quickly
- Opening with a report before the model is established

## Success test

If a judge watches for 45 seconds with no narration, they should still understand:

- this is a graph of organizational dependencies
- the system is simulating failure paths
- the ranked output leads to concrete interventions

## Sources

- Contrast Graph: https://www.contrastsecurity.com/contrast-graph
- Cye Attack Route Visualization: https://cyesec.com/product/attack-route-visualization
