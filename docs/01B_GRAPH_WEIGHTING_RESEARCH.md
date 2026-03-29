# Module 1B — Research Deep Dive on Graph Weights, Node Information, and Future Scenario Prediction

## Why this document exists

The current graph-building approach in [01_DATA_INGESTION.md](/home/kaisiq/Programming/private/halkite46/docs/01_DATA_INGESTION.md) is too subjective for a deterministic stress-testing platform:

- one developer's intuition is setting `θ` and edge weights
- node metadata is underspecified
- there is no evidence trail for why a node or edge exists
- there is no calibration loop from real incidents, outages, or near-misses

For Achilles, that is a problem. The platform is explicitly deterministic after graph construction. That means the graph must be the auditable, evidence-backed source of truth. If the graph is vibe-coded, the simulation results are also vibe-coded.

This deep dive reviews research papers that are most relevant to:

- deciding what information a node should contain
- assigning edge weights and node importance in a defensible way
- reconstructing missing dependencies from observed failures
- supporting future scenario analysis without turning the runtime engine into a black box

## Short conclusion

The strongest approach for Achilles is not to copy any single paper's model.

The best fit is a hybrid:

1. Use structured extraction plus ontology rules to define node types and metadata.
2. Use stakeholder mapping methods such as fuzzy cognitive mapping to surface missing entities and dependencies.
3. Use structured expert judgment and pairwise comparisons when data is sparse.
4. Use causal discovery and event-log analysis to validate edge direction and discover missing edges.
5. Use cascading-failure literature to calibrate dependency semantics and detect threshold-like weakpoints.
6. Keep the Achilles runtime deterministic by freezing `θ`, `r`, and edge weights after calibration.
7. Put probability only around exogenous future events, not inside the cascade math.

For this product, the most valuable output is:

- a deterministic graph for simulation
- an evidence ledger for every node and edge
- an offline calibration process
- a separate scenario prior layer that says which shocks are plausible in the future

That gives you "prediction" in the form of conditional future risk ranking, which fits the product constraints much better than claiming a single probabilistic future.

## Achilles constraints from the docs

From [01A_GRAPH_MODEL.md](/home/kaisiq/Programming/private/halkite46/docs/01A_GRAPH_MODEL.md), [02A_CASCADE_ENGINE.md](/home/kaisiq/Programming/private/halkite46/docs/02A_CASCADE_ENGINE.md), and [04_STATE_TREE.md](/home/kaisiq/Programming/private/halkite46/docs/04_STATE_TREE.md):

- nodes have exactly three mathematical values: `h`, `θ`, and `r`
- edges have one mathematical value: `weight`
- the cascade engine is deterministic
- AI may help build the graph, but AI must not alter the math after the graph exists
- the state tree explores future scenario branches by applying events to the deterministic graph

This means the research question is not "what is the fanciest forecasting model?"

It is:

"How do we build a graph whose node metadata, node importance, and dependency weights are good enough that deterministic scenario exploration becomes credible?"

## What the literature says

### 1. Interdependent-network papers are the strongest justification for modeling cross-layer dependencies explicitly

The most important foundational paper here is Buldyrev et al. (2010), which showed that failures in interdependent networks can cascade abruptly across coupled systems rather than degrade smoothly.

Why it matters for Achilles:

- it validates the core design choice that cross-layer dependencies matter
- it supports explicit modeling of people, technology, operations, suppliers, and finance in one graph
- it warns that small local failures can trigger disproportionate global collapse if dependencies are tightly coupled

Achilles implication:

- do not simplify the graph into a single same-layer org chart
- cross-layer edges should be first-class
- nodes that bridge layers should receive special attention during weighting and weakpoint analysis

Most useful takeaway for weights:

- edge weights should capture dependency strength, not similarity or communication frequency
- node importance should include "blast radius through dependencies," not just seniority or revenue labels

Relevant source:

- Buldyrev SV, Parshani R, Paul G, Stanley HE, Havlin S. "Catastrophic cascade of failures in interdependent networks." Nature, 2010. https://www.nature.com/articles/nature08932

### 2. More realistic cascading-failure work suggests a single raw edge weight is often too crude

Brummitt-style and follow-on interdependency papers, including work on multiple support-demand links and supply thresholds, show that real systems do not fail only because one link disappears. They fail because support is lost below some threshold, often with multiple substitutes.

Why it matters for Achilles:

- a node may depend on several suppliers, systems, or people at once
- two moderate dependencies can jointly matter more than one strong dependency
- substitutability is essential and should not be hidden in a single guessed weight

Achilles implication:

- keep the runtime edge model simple if needed
- but during graph construction, capture enough metadata to compress many real-world dependency facts into one deterministic weight

Recommended metadata additions per dependency:

- `dependency_type`: operational, informational, financial, regulatory, physical, managerial
- `substitutes_available`: integer or band
- `time_to_substitute`
- `minimum_support_required`
- `evidence`

Then derive the final edge weight from those fields instead of asking an LLM to guess directly.

Relevant source:

- Shao J, Buldyrev SV, Havlin S, Stanley HE. "Cascading Failures in Interdependent Networks with Multiple Supply-Demand Links and Functionality Thresholds." Scientific Reports, 2017. https://www.nature.com/articles/s41598-017-14384-y

### 3. Fuzzy cognitive mapping is one of the best research-backed methods for surfacing missing nodes and edges from stakeholder knowledge

Ozesmi and Ozesmi (2004) describe a multi-step fuzzy cognitive mapping approach where stakeholders externalize concepts and causal links in a system. This is especially useful when the available information is fragmented, qualitative, and distributed across people.

Why it matters for Achilles:

- organizations usually do not have complete machine-readable dependency maps
- important dependencies are often tacit knowledge held by managers, operators, or subject-matter experts
- stakeholder mapping sessions are a strong antidote to one-developer graph design

What to use from the paper:

- use workshops or interviews to elicit candidate nodes and links
- merge maps across stakeholders
- keep disagreements instead of averaging them away too early
- convert the merged concept map into the Achilles schema

What not to copy directly:

- do not use fuzzy cognitive map simulation as the Achilles runtime engine
- Achilles already has a deterministic cascade model; FCM is better used upstream for graph discovery and gap finding

Achilles implication:

- FCM is a graph elicitation method, not the final simulation method
- it is especially useful for `meta.evidence`, `meta.owner`, missing dependencies, and cross-layer link discovery

Relevant source:

- Ozesmi U, Ozesmi SL. "Ecological models based on people's knowledge: a multi-step fuzzy cognitive mapping approach." Ecological Modelling, 2004. https://www.sciencedirect.com/science/article/pii/S030438000300543X

### 4. Structured expert judgment is the best fallback when hard data is sparse, but the experts must be weighted by performance, not status

A major problem in the current workflow is that weight assignment is effectively expert judgment without structure. The structured expert judgment literature, especially Cooke's classical model and later validation work by Colson and Cooke, is relevant because it gives a defensible way to combine expert opinions.

Why it matters for Achilles:

- many organizations will not have enough incident data to estimate dependencies statistically
- you will still need human judgment
- unstructured judgment is exactly how vibe-coded graphs happen

What to use from the literature:

- ask calibrated seed questions whose answers become known later or are already known to the project team
- score experts on statistical accuracy and informativeness
- use performance-based weighting instead of equal weighting or seniority weighting

Achilles implication:

- if three experts disagree on `θ` or on an edge weight, do not average them blindly
- maintain expert-specific judgments and compute a weighted combination
- store the final combined value plus the contributing judgments in metadata

Relevant source:

- Colson AR, Cooke RM. "Cross validation for the classical model of structured expert judgment." Reliability Engineering & System Safety, 2017. https://pure.strath.ac.uk/ws/portalfiles/portal/64407118/Colson_Cooke_RESS_2017_classical_model_of_structured_expert_judgment.pdf

### 5. Pairwise-comparison methods are useful when experts can compare dependencies more reliably than they can assign raw numbers

In practice, experts often struggle to say "this edge is 0.63" but can reliably answer "A is more critical than B" or "the ERP system is more operationally central than payroll." Pairwise-comparison work used in Bayesian-network and fault-tree settings shows a practical way to turn these qualitative comparisons into numerical parameters.

Why it matters for Achilles:

- your prompt currently asks for raw numbers directly
- humans are usually better at relative judgment than absolute judgment

Achilles implication:

- for `θ`, ask pairwise criticality comparisons within the same layer or function family
- for edge weights, ask pairwise dependency comparisons for the same target node
- normalize the resulting priorities into `[0, 1]`

This is especially useful early, before you have enough event data.

Relevant source:

- Khan et al. "Utilizing Expert Knowledge and Contextual Information in the Event and Fault Trees Generation and Bayesian Network Transformation Process." 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC9303608/

### 6. Causal-graph literature is essential for deciding edge direction and keeping the graph from encoding correlation as dependency

Pearl's causal-graph work and later causal-discovery reviews matter because Achilles needs directional dependencies. A graph where edges represent mere association will produce misleading cascades.

Why it matters for Achilles:

- an edge in Achilles means loss propagates from `from` to `to`
- that is a causal claim, not a semantic similarity claim
- misdirected edges will corrupt every scenario result downstream

What to use from the literature:

- insist on causal semantics for edges
- separate confounders from direct dependencies where possible
- when you have time series or event logs, use causal-discovery methods as an offline validation pass

Achilles implication:

- each edge should carry an evidence type such as `documented_process`, `system_architecture`, `incident_log`, `expert_claim`, or `causal_discovery_candidate`
- low-evidence edges should be reviewed before being promoted to production graphs

Relevant sources:

- Pearl J. "Causal diagrams for empirical research." Biometrika, 1995. https://academic.oup.com/biomet/article/82/4/669/251647
- Spirtes P, Zhang K. "Causal discovery and inference: concepts and recent methodological advances." Applied Informatics, 2016. https://applied-informatics-j.springeropen.com/counter/pdf/10.1186/s40535-016-0018-x.pdf

### 7. Network-reconstruction papers are directly relevant if you want to learn hidden edges from incident history

Wang, Yu, and Baroud (2022) propose a Bayesian approach to reconstructing interdependent infrastructure networks from observations of cascading failures. This is one of the closest papers to the Achilles problem when historical failure sequences exist but the full dependency graph is not known.

Why it matters for Achilles:

- many organizations know the incidents they had
- they do not know the true graph that produced them
- observed cascades can reveal hidden interdependencies

What to use from the paper:

- use historical disruptions, outages, ticket chains, or supplier incidents as evidence for hidden edges
- treat graph reconstruction as an offline inference job
- use the inferred edges as candidates for human review, not as auto-accepted truth

Achilles implication:

- build a "candidate edges from incidents" pipeline
- compare reconstructed edges with LLM-extracted edges
- prioritize disagreements for analyst review

Relevant source:

- Wang Y, Yu JZ, Baroud H. "A Bayesian Approach to Reconstructing Interdependent Infrastructure Networks from Cascading Failures." arXiv, 2022. https://arxiv.org/abs/2211.15590

### 8. Cross-impact balance is useful for future scenario generation, but not for runtime cascade math

Weimer-Jehle's Cross-Impact Balance (CIB) work is useful because Achilles does not only need a graph; it needs a disciplined way to generate plausible future shock combinations.

Why it matters for Achilles:

- the state tree can branch infinitely if event generation is unconstrained
- users want future-oriented prediction, not only single-node kill tests
- many real strategic futures depend on compatible combinations of events, not isolated shocks

What to use from the literature:

- encode mutual reinforcement or contradiction among exogenous events
- use these relationships to filter implausible future event sets
- generate consistent scenario bundles before feeding them into the deterministic cascade engine

Achilles implication:

- CIB belongs in scenario selection, not in graph-weight estimation
- use it to prioritize which branches the agents explore in Module 4

Relevant source:

- Weimer-Jehle W. "Cross-impact balances." Physica A, 2008. https://econpapers.repec.org/RePEc:eee:phsmap:v:387:y:2008:i:14:p:3689-3700

## What this means for node information

The current node schema is mathematically minimal and that is fine. The problem is the metadata is too loose.

For graph construction and auditability, each node should carry structured metadata even if only `θ`, `r`, and `h` affect runtime math.

Recommended node metadata fields:

```json
{
  "type": "person | team | service | supplier | facility | process | asset | revenue_stream | control",
  "function": "free-text canonical business function",
  "layer": "existing Achilles layer",
  "owner": "responsible person/team",
  "location": "site/region if relevant",
  "capacity": "normalized or raw if known",
  "substitutability": 0.0,
  "max_tolerable_downtime_hours": 0,
  "single_point_of_failure": true,
  "upstream_count": 0,
  "downstream_count": 0,
  "evidence": [
    {
      "kind": "document | interview | incident | system_log | org_chart | architecture_diagram",
      "source": "file or interview id",
      "confidence": 0.0
    }
  ],
  "judgment_basis": {
    "theta_method": "impact_simulation | expert_pairwise | hybrid",
    "recovery_method": "sla | historical_median | expert_estimate"
  }
}
```

Why these fields matter:

- `type` and `function` keep the ontology stable
- `substitutability` is one of the strongest drivers of both `θ` and edge weight
- `max_tolerable_downtime_hours` anchors severity in operational reality
- `single_point_of_failure` identifies nodes that deserve aggressive review
- `evidence` makes the graph auditable

## How to assign `θ` without guessing

In Achilles, `θ` is described as network dependency or importance weight. That definition is directionally right, but it is too easy to set it subjectively.

The literature suggests using a hybrid of:

- business criticality
- dependency centrality
- irreplaceability
- recovery burden
- observed historical impact

Recommended offline formula:

```text
θ_v = clamp(
    0.30 * blast_radius_score(v) +
    0.25 * irreplaceability_score(v) +
    0.20 * operational_criticality_score(v) +
    0.15 * recovery_penalty_score(v) +
    0.10 * historical_incident_score(v),
    0,
    1
)
```

Where:

- `blast_radius_score(v)` comes from deterministic simulations such as single-node kill tests
- `irreplaceability_score(v)` comes from expert elicitation and substitute counts
- `operational_criticality_score(v)` comes from role/process/service ownership
- `recovery_penalty_score(v)` is a normalized version of `r`
- `historical_incident_score(v)` comes from real outages, near-misses, or revenue impacts

Why this is better than gut feel:

- it uses the Achilles engine itself to define part of node importance
- it ties `θ` to consequences, not titles
- it remains deterministic once the inputs are frozen

Practical recommendation:

- initialize `θ` with pairwise expert comparison
- run weakpoint analysis
- update `θ` using measured blast-radius signals
- freeze the value with provenance

## How to assign edge weights without guessing

A single raw number should be the last step, not the first.

Recommended dependency dimensions:

- operational dependence: if source fails, does target stop doing its core job?
- information dependence: does target lose required knowledge, data, or visibility?
- control dependence: does target lose approval, governance, or authorization?
- physical dependence: does target lose material, energy, access, or facility support?
- financial dependence: does target lose the cashflow or budget needed to function?
- substitutability penalty: how hard is it to reroute around the source?
- time-to-workaround penalty: how long before workaround restores function?

Recommended offline formula:

```text
w(source -> target) = clamp(
    0.25 * operational +
    0.15 * information +
    0.10 * control +
    0.15 * physical +
    0.10 * financial +
    0.15 * substitutability_penalty +
    0.10 * workaround_delay,
    0,
    1
)
```

Notes:

- the coefficients are a starting policy, not a theorem
- they should be tuned with historical incidents and expert review
- for some layers, different coefficients are justified

Examples:

- a CEO to junior engineer edge should usually be low on direct operational dependence unless approvals are truly blocking
- an identity provider to production systems edge may be high because workaround delay and operational dependence are high
- one supplier among five interchangeable suppliers should have low substitutability penalty and therefore lower weight

## Best-fit methodology for Achilles

### Recommended pipeline

#### Stage 1: Build a typed candidate graph

Sources:

- uploaded documents
- spreadsheets
- org charts
- architecture diagrams
- interviews
- incident logs

Output:

- typed nodes
- typed candidate edges
- evidence references

The LLM can still help here, but only as an extractor and organizer.

#### Stage 2: Run stakeholder elicitation

Use a fuzzy-cognitive-mapping style workshop or interview format to ask:

- what breaks if this node goes down?
- what can replace it?
- what is the time-to-workaround?
- what hidden dependencies are missing from the documents?

Output:

- missing nodes
- missing edges
- substitutability facts
- disagreement log

#### Stage 3: Use structured expert judgment for values that remain uncertain

Apply this to:

- `θ`
- edge weight components
- `r` when no hard recovery data exists

Rules:

- do not rely on one expert
- use calibration questions where possible
- record expert-specific inputs before aggregation

#### Stage 4: Use historical failures to calibrate the graph

Compare known incidents with Achilles simulations:

- if a real outage propagated but the graph did not, edges are missing or underweighted
- if the graph predicts massive cascades that never happen, weights are too strong or substitutability is missing

This is the highest-value calibration loop in the entire system.

#### Stage 5: Freeze the deterministic graph

Once `θ`, `r`, and edge weights are set:

- version the graph
- store provenance for every mathematical value
- use only that frozen graph for weakpoint analysis, agents, and state-tree exploration

## How to do future prediction without violating the product constraints

The phrase "giving a prediction" needs precision.

Achilles should not claim:

- "this exact future will happen"

Achilles can credibly claim:

- "if these disruptions happen, this is the deterministic outcome"
- "these event bundles are more plausible than others"
- "these branches dominate the future risk surface"

That leads to a clean architecture:

### Layer 1: Deterministic consequence engine

Already in the docs:

- graph
- cascade engine
- weakpoint analysis
- state tree

### Layer 2: Scenario prior layer

Research-backed inputs:

- cross-impact balance for consistent event bundles
- historical event frequencies
- external hazard tables
- analyst-defined strategic shocks

### Layer 3: Forecast output

Instead of one prediction, return:

- top plausible scenarios
- worst plausible scenarios
- expected health loss under a scenario set
- most fragile nodes across plausible futures

This is a much more defensible product than "AI predicts your future."

## Recommended research-backed changes to the current ingestion prompt

The current prompt in [01_DATA_INGESTION.md](/home/kaisiq/Programming/private/halkite46/docs/01_DATA_INGESTION.md) asks the model to emit direct numeric `θ` and edge weights from raw documents. That is too much inference in one step.

Recommended change:

Split the prompt into four outputs:

1. node extraction
2. edge extraction
3. evidence extraction
4. scoring features, not final scores

Example scoring features the model should extract:

- critical process ownership
- number of substitutes
- time-to-workaround
- whether dependency is direct or inferred
- dependency type
- confidence

Then a deterministic scoring layer inside the backend converts those features into:

- `θ`
- `r`
- `weight`

That is a major improvement because:

- the LLM stops making the final mathematical call
- the backend scoring policy becomes testable
- the graph becomes easier to recalibrate later

## Concrete recommendation for the next implementation pass

If the goal is to stop vibe-coding quickly, the fastest high-value sequence is:

1. Add structured metadata and evidence fields for nodes and edges.
2. Stop asking the LLM for final `θ` and final edge `weight` directly.
3. Ask the LLM for scoring features and evidence instead.
4. Add a deterministic scorer for `θ` and `weight`.
5. Add an expert-review interface for unresolved edges and top-importance nodes.
6. Add incident-log calibration against past disruptions.
7. Add scenario-bundle generation for future exploration using a CIB-style consistency layer.

## Best paper-to-use-case mapping

If the question is "which papers are most valuable for our specific use case?", the ranking is:

1. Buldyrev et al. 2010
   Reason: strongest foundation for why cross-layer dependencies and abrupt cascades matter.

2. Wang et al. 2022
   Reason: closest match to reconstructing hidden dependencies from observed cascading failures.

3. Colson and Cooke 2017
   Reason: best defense against subjective expert weighting when data is incomplete.

4. Ozesmi and Ozesmi 2004
   Reason: best practical method for surfacing tacit nodes and missing dependencies from stakeholders.

5. Pearl 1995 and Spirtes & Zhang 2016
   Reason: critical for edge direction, causal semantics, and avoiding correlation-as-dependency errors.

6. Weimer-Jehle 2008
   Reason: best fit for generating coherent future event bundles before state-tree exploration.

7. Shao et al. 2017
   Reason: strongest reminder that substitutability and support thresholds must inform weights.

## Final recommendation

For Achilles, the most valuable design is:

- use LLMs to extract candidate graph structure and evidence
- use research-backed elicitation to fill gaps
- use deterministic formulas to convert evidence into `θ` and edge weights
- use historical cascades to calibrate the graph
- use scenario methodology to rank plausible futures, not to replace the core engine

That is the path from "one mid developer's vibe-coded graph" to a graph that can support serious stress testing and future scenario prediction.

## Sources

- Buldyrev SV, Parshani R, Paul G, Stanley HE, Havlin S. "Catastrophic cascade of failures in interdependent networks." Nature, 2010. https://www.nature.com/articles/nature08932
- Shao J, Buldyrev SV, Havlin S, Stanley HE. "Cascading Failures in Interdependent Networks with Multiple Supply-Demand Links and Functionality Thresholds." Scientific Reports, 2017. https://www.nature.com/articles/s41598-017-14384-y
- Ozesmi U, Ozesmi SL. "Ecological models based on people's knowledge: a multi-step fuzzy cognitive mapping approach." Ecological Modelling, 2004. https://www.sciencedirect.com/science/article/pii/S030438000300543X
- Colson AR, Cooke RM. "Cross validation for the classical model of structured expert judgment." Reliability Engineering & System Safety, 2017. https://pure.strath.ac.uk/ws/portalfiles/portal/64407118/Colson_Cooke_RESS_2017_classical_model_of_structured_expert_judgment.pdf
- Khan et al. "Utilizing Expert Knowledge and Contextual Information in the Event and Fault Trees Generation and Bayesian Network Transformation Process." 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC9303608/
- Pearl J. "Causal diagrams for empirical research." Biometrika, 1995. https://academic.oup.com/biomet/article/82/4/669/251647
- Spirtes P, Zhang K. "Causal discovery and inference: concepts and recent methodological advances." Applied Informatics, 2016. https://applied-informatics-j.springeropen.com/counter/pdf/10.1186/s40535-016-0018-x.pdf
- Wang Y, Yu JZ, Baroud H. "A Bayesian Approach to Reconstructing Interdependent Infrastructure Networks from Cascading Failures." arXiv, 2022. https://arxiv.org/abs/2211.15590
- Weimer-Jehle W. "Cross-impact balances." Physica A, 2008. https://econpapers.repec.org/RePEc:eee:phsmap:v:387:y:2008:i:14:p:3689-3700
