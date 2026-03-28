# Pivot Notes

## User Prompt

We are building a inference on top of a datalake for enterprise businesses and get their data and have the possibility to create a graph of values for each node (person,supplier,etc). What are the 15 nieches with gaps where we fit, except Standart Operational Procedures? If only SOPs are the case, what nieches there, except supply and demand and compliance? I need a throughout and validated research so I can make an informated decision for our pivot as a startup

Give me the full random pivot that a CEO in my shoes would do, having digged through that research and our codebase that we can scrap if needed.

## Pivot Recommendation

### The Pivot

If I were CEO in your position, I would kill the current "universal network survival analyzer" story and pivot to:

**Operational Dependency Intelligence for enterprise change risk and resilience**

Plain English:
You ingest enterprise data into a deterministic graph, score every node and dependency, and answer one question buyers already pay for:

**"If this person, supplier, system, contract, or process changes or fails, what breaks, how badly, and what should we protect first?"**

I would not pivot to generic SOPs. I would not sell "AI for enterprise graphs." I would not keep the adversarial-simulation framing as the main product. That framing is interesting, but it is too far from a clean budget line.

The first wedge would be:

**Change Impact and Blast Radius for operations-heavy enterprises**

Examples:
- changing a supplier
- changing a key employee or team structure
- changing a system or data pipeline
- changing a contract, SLA, or process handoff
- shutting down a site, product line, or service dependency

### Why This Is The Right Pivot

The market research says the broad categories are already taken: process mining, lineage, customer 360, TPRM, access graph, CLM, generic ontology. Your opening is not "we also make a graph." Your opening is:

**deterministic cross-silo dependency scoring for business decisions**

That matches your codebase unusually well.

What you already have is not a workflow app. It is a math engine:
- graph model with node importance, health, recovery cost
- deterministic cascade propagation
- weakpoint ranking
- graph ingestion from messy enterprise files

That is enough to become a serious wedge product.

What does not fit the pivot nearly as well:
- "agent attacker" language
- worst-case scenario theater
- generic resilience storytelling
- universal simulation UX

Those are demo-friendly, not budget-friendly.

### What I Would Keep And What I Would Scrap

Keep:
- the deterministic graph core
- cascade engine
- weakpoint analysis
- ingestion pipeline
- graph editing and session flow
- the front-end upload and graph entry flow

Scrap or heavily demote:
- the "adversarial agents" category story
- the "worst-case attack path" narrative as core product value
- generic resilience analysis positioning on the landing page

Reframe instead:
- `kill` event becomes "loss / outage / exit / removal / deprecation"
- `damage` becomes "partial degradation / transition risk / SLA slippage"
- `cut_edge` becomes "handoff broken / contract ended / integration removed"

That is not a rewrite of the engine. It is a rewrite of the product language and workflow.

### The Product I Would Actually Build

**Category**
Operational Dependency Intelligence

**Core use case**
Before a company changes something important, it simulates impact across people, systems, suppliers, contracts, and operations.

**Primary buyer**
COO, transformation lead, enterprise architect, head of operations, CIO office

**First ICP**
Mid-market to enterprise companies with:
- multiple systems
- real operational dependencies
- recurring change programs
- expensive outages or handoff failures
- no clean source of truth across teams

Best verticals:
- manufacturing
- logistics
- industrial services
- multi-entity B2B services
- PE-backed rollups
- post-M&A integration environments

**First pain point**
"We keep making changes without understanding cross-functional blast radius."

That pain is easier to sell than:
- "find weakpoints in your organization"
- "simulate catastrophic failure"
- "AI-generated SOPs"

### The Wedge SKU

I would launch one product only:

**Change Impact Workspace**

Input:
- org data
- supplier lists
- system/application inventory
- process docs
- contracts / SLAs
- spreadsheets / exports / shared-drive docs

Output:
- dependency graph
- top critical nodes
- blast radius score for proposed changes
- top impacted functions
- expected recovery / mitigation burden
- recommended mitigations before approval

This should feel like:
- part enterprise architecture
- part operational risk
- part continuity planning
- but far more concrete than any of them

### The CEO-Level Bet

The real bet is:

**Enterprises do not need another system of record. They need a system of consequence.**

Your product should not be where data lives.
It should be where the company learns what a decision will break.

That is a sharper company than:
- graph company
- SOP company
- resilience company
- AI operations company

### 90-Day Pivot Plan

1. Replace the NEXUS story everywhere with "dependency intelligence for change risk."
2. Remove attacker/agent terminology from product-facing surfaces.
3. Turn `/cascade` into "simulate change impact."
4. Turn `/analyze` into "critical dependency map."
5. Turn `/explore` into a small set of business scenarios, not open-ended adversarial search.
6. Add scenario templates:
   - remove supplier
   - role vacancy
   - system outage
   - process delay
   - contract/SLA breach
   - site shutdown
7. Build one report buyers can circulate:
   - proposed change
   - blast radius
   - most exposed nodes
   - mitigation options
   - residual risk
8. Sell services-assisted pilots first, not self-serve software.

### What I Would Say No To

I would explicitly not pivot into:
- generic SOP management
- process mining
- contract lifecycle management
- generic data governance
- generic enterprise knowledge graph
- generic agent platform

Those markets are too crowded, and they pull you away from the strongest reusable asset you already built: deterministic consequence modeling.

### My Decision If I Were You

I would keep roughly **60-70% of the backend logic**, scrap most of the current product framing, and relaunch the company as:

**a decision-support platform for enterprise dependency impact**

Not "AI that maps the business."
Not "software for SOPs."
Not "catastrophe simulation."

**A system that tells operators what a change will break before they make it.**
