# ACHILLES — Business Plan & Pitch Kit

**Prevent the predictable. Then move faster.**

---

## 1. THE PROBLEM

Every organization is a network of invisible dependencies — people, systems, suppliers, facilities — all connected in ways nobody fully understands. When one piece fails, the damage doesn't stop there. It cascades.

The problem isn't the risks you know about. It's the ones you don't. A single-sourced connector supplier ghosts you, and your entire product line stops shipping. Your head of DevOps leaves, and it turns out they were the only person who knew how to deploy to production. These aren't hypothetical — they happen every day, and they blindside leadership every time.

**Why now?**

- **NIS2** (EU Directive 2022/2555) took effect October 2024 and mandates cybersecurity risk management, supply chain security assessments, and business continuity planning for all medium-to-large entities across 18 critical sectors. First formal compliance audits are due **June 30, 2026**. Fines reach **€10M or 2% of global annual turnover**.
- **DORA** (Digital Operational Resilience Act) has been directly applicable since January 17, 2025, requiring all EU financial entities — banks, insurers, investment firms, payment providers, and their critical ICT suppliers — to implement comprehensive operational resilience frameworks, including third-party dependency mapping, scenario-based testing, and incident management.
- These regulations create a **forced buying event**. Companies don't have a choice — they need to map dependencies, assess risks, and test resilience. The question is whether they do it with consultants over 6 months, or with Achilles in an hour.

**The gap in the market:** Existing business continuity management (BCM) tools focus on _plans and documents_ — they help you write a disaster recovery playbook. Achilles focuses on _structural analysis_ — it finds the disaster scenarios you didn't know to plan for.

---

## 2. THE SOLUTION

Achilles is an organizational stress-testing platform. You upload whatever you have about your organization — org charts, spreadsheets, system diagrams, supplier lists, even whiteboard photos — and Achilles:

1. **AI builds the graph** — reads unstructured data and constructs a dependency network of people, teams, systems, suppliers, and processes
2. **Math finds the truth** — deterministic graph algorithms (no AI guessing, no hallucination) identify every bridge node, every fragile cluster, every compound failure point
3. **Adversarial agents attack** — five specialized agents run thousands of simulations: bridge breaking, compound exploitation, layer assassination, cluster isolation, and critical node targeting
4. **Stories explain the risk** — AI translates mathematical findings into concrete narratives: _"If STMicroelectronics has a chip shortage and your CTO leaves simultaneously, 16 products stop shipping and nobody can maintain the firmware."_
5. **Recommendations fix it** — specific, actionable: _"Add a secondary supplier for connectors. Cross-train two engineers on firmware. Reduce recovery time for ERP from 72h to 8h."_

**The key insight:** AI generates the graph. Math computes the truth. AI explains what it means.

**The two-phase value proposition:**

- **Phase 1 — Risk audit:** First use finds your blind spots. Single points of failure, brittle clusters, compound vulnerabilities. This alone is worth what consultants charge for weeks of work.
- **Phase 2 — Strategic development:** From then on, every reorg, every new hire, every supplier change, every M&A decision gets stress-tested before you commit. Achilles becomes your structural decision-making layer.

_First it helps you survive. Then it helps you move faster._

---

## 3. TARGET MARKET

### Primary: Regulated Enterprises (80% of revenue)

**Who:** Banks, telcos, utilities, insurers, healthcare providers, critical infrastructure operators across the EU.

**Why they buy:** NIS2 and DORA compliance is mandatory. They need dependency mapping, risk assessments, supply chain security reviews, and business continuity testing — all of which Achilles provides as automated output. The alternative is hiring consultants at €1,500/day for months.

**Sectors (in priority order):**

| Sector                       | Regulatory Driver    | Urgency                       |
| ---------------------------- | -------------------- | ----------------------------- |
| Banking & Financial Services | DORA (live Jan 2025) | Immediate — audits underway   |
| Insurance                    | DORA                 | Immediate                     |
| Telecom                      | NIS2                 | High — first audits June 2026 |
| Energy & Utilities           | NIS2                 | High                          |
| Healthcare                   | NIS2                 | High                          |
| Manufacturing (critical)     | NIS2 expanded scope  | Medium                        |

**Deal characteristics:** 6-12 month sales cycle, security review required, on-prem deployment option essential, licensing-based pricing, document generation (compliance reports) is a key deliverable.

### Secondary: Scaleups (20% of revenue)

**Who:** Companies with 50-500 employees growing fast, typically in tech, e-commerce, or SaaS. Often VC-backed with board-level pressure to professionalize risk management.

**Why they buy:** Moving fast and terrified speed creates blind spots. Key person risk is real — one departure can cascade. They don't need compliance documents; they need someone to tell them what's broken and help them fix it.

**Deal characteristics:** Short sales cycle, self-serve possible, lower ACV but higher volume, "come and taste" approach — show value immediately, convert to ongoing.

### Market Size

The global business continuity management solutions market is valued at approximately **$2.6B in 2026**, growing at **~11% CAGR** to reach **~$4B by 2030**. The broader risk management software market is projected at **$21B+ by 2026**.

Achilles targets a specific wedge of this market: **automated structural risk analysis**, which sits between traditional BCM tools (plan-focused) and GRC platforms (compliance-focused). This is a greenfield category.

---

## 4. COMPETITIVE LANDSCAPE

| Category         | Examples                                         | What they do                                                              | Achilles advantage                                                                           |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| BCM Software     | Fusion Risk Management, LogicManager, Quantivate | Plan creation, document management, recovery workflows                    | Achilles _finds_ the risks; these tools help you _document_ the plan                         |
| GRC Platforms    | MetricStream, SAI360, NAVEX                      | Compliance tracking, audit management, policy enforcement                 | Achilles provides the structural analysis that feeds GRC workflows                           |
| Consulting       | Big 4, Deloitte, KPMG                            | Manual dependency mapping, risk assessments                               | Weeks of work → 1 hour. Achilles doesn't replace consultants but makes them 10x faster       |
| Plan A (analogy) | Plan A (plana.earth)                             | Carbon accounting — simple calculator that rides EU emissions regulations | Same playbook: simple tool that rides a regulatory wave (NIS2/DORA instead of CSRD/emissions) |

**The moat:** The graph construction pipeline (AI reading unstructured org data) combined with the adversarial simulation engine (deterministic, not AI-guessed). Competitors would need to build both, and the simulation layer is pure algorithmic IP.

---

## 5. BUSINESS MODEL

### Enterprise (80%)

- **Licensing model** — annual license based primarily on company size, with enterprise as the primary revenue driver
- **On-prem deployment option** — critical for regulated industries. _"This solution can start in a garage with the level of security a bank requires."_
- **Document generation** — automated compliance reports aligned with NIS2/DORA requirements
- **Segmented data** — each department/entity gets isolated data views
- **Implementation services** — initial onboarding, data import, first assessment (can be partnered with consulting firms)

**Pricing anchors:**

- A compliance consultant costs €1,500/day × 30-60 days = **€45K-90K per assessment**
- Achilles delivers comparable output in hours
- Enterprise license: annual pricing by employee band, starting at **€35K/year** for enterprise accounts
- Land with an initial assessment engagement, expand to ongoing monitoring

### SME / Scaleup (20%)

- **Annual contract model** — feeder tier for future enterprise expansion, not a parallel primary business
- **Quarterly billing** — all smaller accounts are sold on annual terms but billed quarterly to reduce entry friction
- **First-quarter exit path** — new SMB and Growth customers can stop after quarter one without being charged the remaining quarters of year one
- **No report generation** — instead, interactive dashboard showing risks and recommended actions ("don't sell them the report, sell them the fix")
- **Lower touch** — product-led growth, content marketing, event demos

**Pricing:** employee-band annual pricing, starting at **€6K/year** for SMB and increasing into enterprise bands for larger organizations.

For the full packaging, billing cadence, triennial terms, and qualification rules, see `BUSINESS_MODEL_PRICING.md`.

---

## 6. GO-TO-MARKET STRATEGY

### The Plan A Playbook: Ride the Regulatory Wave

Just as Plan A built a simple carbon calculator that became essential when EU emissions regulations hit, Achilles builds a dependency analysis tool that becomes essential as NIS2 and DORA enforcement ramps up in 2025-2026.

**Phase 1: First 10 Customers (Months 1-6)**

1. **Enterprise sales motion** — Daniel's pipeline: sales meeting → security meeting → deployment project
2. **Target compliance-deadline-driven buyers** — companies facing June 2026 NIS2 audit deadlines
3. **Lead with the assessment** — paid initial engagement (€5-15K) that produces a compliance-ready risk report. This is the "come and taste" moment.
4. **Leverage events** — present at industry conferences (fintech, compliance, cybersecurity), publish thought leadership (whitepapers on NIS2/DORA compliance)
5. **Build the MClimate case study** — real data, real findings, real story. This becomes the demo and the proof point.

**Phase 2: Scale (Months 6-18)**

1. **Channel partnerships** — partner with consulting firms (Big 4, regional firms) who already do risk assessments manually. Achilles makes them faster; they bring the clients.
2. **Content marketing** — track regulatory framework changes, publish alerts when new requirements create new risk categories. Position Achilles as the thought leader on structural organizational risk.
3. **Monitor pending regulatory changes** — stay ahead of what's coming next. Every new regulation is a new sales trigger.

### How We Reach Decision-Makers

- **CISOs and CROs** — they own the compliance budget and feel the regulatory pressure
- **CTOs** — they understand the technical risk and can champion internally
- **Board members** — NIS2 makes them _personally liable_ for cybersecurity failures. This is the escalation path.

**Channels:** Industry events, whitepapers, LinkedIn thought leadership, direct outreach to compliance teams at regulated entities, partnerships with law firms and consultancies that advise on NIS2/DORA.

---

## 7. RISK CATEGORIES (WHAT ACHILLES MAPS)

Achilles analyzes organizational risk across six categories:

1. **People** — key person dependencies, single points of knowledge, succession gaps, hiring pipeline risks
2. **Technology** — single-maintainer systems, unowned infrastructure, no failover, technical debt clusters, deployment dependencies
3. **Supply Chain** — single-source suppliers, long lead times, no backup vendors, geographic concentration
4. **Commercial** — revenue concentration in few clients, single-channel dependency, key account relationships
5. **Operational** — single facility, single cloud region, single payment provider, process bottlenecks
6. **Regulatory** — compliance gaps, upcoming framework changes, cross-border requirements

Each risk is scored on: **probability of failure × cascade impact × recovery time**

---

## 8. FUTURE ROADMAP

### Near-term (easy wins, fast traction)

- **Regulatory change monitoring** — automatically track changes to NIS2, DORA, and other corporate frameworks. Alert when something that was safe yesterday becomes a risk today.
- **Security risk integration** — connect to vulnerability scanners and threat intelligence feeds. Add cybersecurity dependencies to the organizational graph.
- **Additional risk factors** — weather/climate risks for supply chains, geopolitical risks for multi-region operations, conflict zone exposure

### Medium-term

- **Continuous monitoring** — real-time updates as org structure changes (connected to HR systems, supplier databases)
- **What-if scenarios** — "What happens if we acquire this company?" / "What if we move to a single cloud provider?" / "What if we restructure this department?"
- **Automated document generation** — compliance reports, board presentations, audit evidence packages

### Long-term

- **Industry benchmarking** — anonymized cross-organization insights. "Companies in your sector typically have 3.2 single points of failure; you have 7."
- **Predictive risk modeling** — based on historical patterns across the customer base, predict emerging risk categories before regulations catch up

---

## 9. TEAM & TRACTION

_[Customize with your actual team details]_

**What we've built so far:**

- Working prototype with dependency graph construction from unstructured data
- Five adversarial simulation agents
- Demo dataset: MClimate (real Bulgarian IoT company)
- [Add any validation conversations, LOIs, or early interest]

**Why we can build this:**

- [Team backgrounds in relevant domains]
- Deep understanding of EU regulatory landscape
- Technical capability in graph algorithms, AI, and enterprise software

_The fastest path to an investor is showing traction. Every signal matters — conversations with potential customers, letters of interest, pilot agreements, waitlist signups._

---

## 10. THE ASK

_[Customize based on hackathon/pitch context]_

---

## APPENDIX A: PITCH SCRIPT (3 MINUTES)

### Opening (30 seconds)

_"We all know the big risks. Your lead engineer quits, your main client churns — you've thought about those. You have plans. Hopefully._

_But what if your Type-C connector supplier ghosts you tomorrow? No backup. Your entire product line stops shipping. Three teams sit idle. Revenue freezes. And nobody in your company even knew you were single-sourced on that part._

_That's the real problem. Not the risks you see coming — the ones you don't."_

### Bridge — Hackathon Theme (10 seconds)

_"The theme of this hackathon is survival. And most companies don't die from one big dramatic blow — they die from a chain reaction nobody saw coming."_

### Product (40 seconds)

_"Achilles finds it before it finds you._

_You upload whatever you have about your organization — org charts, spreadsheets, documents. AI reads it all and builds a dependency graph. Then pure math takes over — deterministic algorithms that identify every bridge node, every fragile cluster, every pair of failures that together are catastrophic._

_Then five adversarial agents — a bridge breaker, a compound exploiter, a layer assassin — run thousands of attack simulations against your network. Think chess engine, but for organizational failure."_

### Demo (60 seconds)

_"Let me show you with a real company — MClimate, a Bulgarian IoT company."_

_[Walk through the demo: upload → graph → vulnerabilities → simulation → scenarios → recommendations]_

### Market & Timing (20 seconds)

_"Why now? NIS2 and DORA — EU regulations that went live in 2024 and 2025 — now require every bank, telco, insurer, and utility to do exactly this kind of structural risk assessment. First compliance audits are due June 2026. The market for business continuity management is $2.6 billion and growing at 11% annually. We're riding a regulatory wave."_

### Business Model (10 seconds)

_"Enterprise licensing for regulated industries — on-prem, compliant, document-generating. SaaS for scaleups. Land with a paid assessment, expand to continuous monitoring."_

### Close (10 seconds)

_"The first time you use Achilles, it finds what's broken. From then on, every decision you make is stress-tested before you commit._

_Prevent the predictable. Then move faster."_

---

## APPENDIX B: REGULATORY REFERENCE

### NIS2 (Network and Information Security Directive 2)

- **Status:** Transposition deadline was October 17, 2024. Many EU member states still completing national implementation.
- **First compliance audits:** Target date June 30, 2026
- **Scope:** 18 critical sectors, all medium-to-large entities. Includes energy, transport, banking, healthcare, digital infrastructure, telecom, manufacturing, and more.
- **Key requirements relevant to Achilles:**
  - Risk assessments and security policies for information systems
  - Supply chain security — must evaluate cybersecurity posture of third-party vendors
  - Business continuity planning
  - Corporate accountability — senior management personally oversees and approves cybersecurity measures
- **Penalties:** Up to €10M or 2% of global annual revenue for essential entities; €7M or 1.4% for important entities
- **Management liability:** Temporary bans from management roles for non-compliance

### DORA (Digital Operational Resilience Act)

- **Status:** Directly applicable across all EU member states since January 17, 2025
- **Scope:** 20+ types of financial entities — banks, insurance companies, investment firms, payment providers, crypto-asset service providers — plus their critical ICT third-party providers
- **Key requirements relevant to Achilles:**
  - Comprehensive ICT risk management framework
  - Third-party dependency mapping and oversight
  - Scenario-based resilience testing
  - Incident classification and rapid reporting (24-hour early warning)
  - Business continuity and disaster recovery planning
- **Penalties:** Up to €10M or 2% of global revenue; management accountability
- **DORA takes precedence** over NIS2 for financial sector entities

### What this means for Achilles

Both regulations mandate exactly what Achilles provides: **dependency mapping, risk assessment, scenario-based testing, and business continuity planning.** The output of Achilles maps directly to regulatory requirements, making the product not a nice-to-have but a compliance tool.

---

## APPENDIX C: JUDGE SCORING OPTIMIZATION

Based on the hackathon grading criteria (total: 115 points):

| Category                          | Points | How Achilles scores                                                                     |
| --------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| **Innovative idea & originality** | 8      | Adversarial simulation on org graphs is novel — not BCM, not GRC, a new category         |
| **Market research**               | 5      | NIS2, DORA, BCM market size ($2.6B), Plan A analogy, sector analysis                     |
| **External data**                 | 2      | Real regulatory data, market reports, MClimate demo dataset                              |
| **UI/UX Design**                  | 10     | [Invest here — the graph visualization and scenario narratives are the wow moment]       |
| **Scalability**                   | 10     | Graph algorithms scale. AI parsing scales. Enterprise can go on-prem.                    |
| **Git + docs**                    | 5      | Clean repo, README, architecture docs                                                    |
| **Deployment**                    | 5      | Deploy the demo                                                                          |
| **Code originality**              | 15     | Graph algorithms, adversarial agents, AI parsing pipeline — all original                 |
| **Tech stack**                    | 10     | [Show it fits the problem — graph DB, AI pipeline, web frontend]                         |
| **Coding style**                  | 10     | Clean, documented, modular                                                               |
| **Security**                      | 5      | On-prem option, data segmentation, no data leaves the org                                |
| **Coherency**                     | 15     | This pitch script is designed for coherency — problem → solution → demo → market → close |
| **Clear explanation**             | 10     | The "AI builds, math computes, AI explains" framework is memorable                       |
| **Demo**                          | 10     | MClimate walkthrough with real findings                                                  |
| **Complex feature**               | 5      | The adversarial simulation engine — explain the five agents                              |

**Presentation is 40 points** — nearly as much as the entire complexity category. The pitch script above is optimized for this.

---

## APPENDIX D: KEY TALKING POINTS FOR Q&A

**"How is this different from existing risk management tools?"**
Existing tools help you document plans for risks you already know about. Achilles finds the risks you don't know about through structural graph analysis and adversarial simulation. We're not replacing BCM — we're the intelligence layer that tells BCM what to plan for.

**"How do you handle data security?"**
On-prem deployment option from day one. Data never leaves the organization. Segmented access by department. We can start in a garage with the level of security a bank requires.

**"What if the AI hallucinates?"**
The AI only does two things: parse documents into a graph, and explain results in natural language. All the risk analysis is deterministic graph algorithms — no AI guessing. The math is the math.

**"How do you get to your first customer?"**
Compliance deadline pressure. Companies facing June 2026 NIS2 audits need this yesterday. We lead with a paid assessment engagement, prove value immediately, convert to ongoing monitoring.

**"What about the quality of input data?"**
Garbage in, garbage out is real. But that's also a feature — if you can't even produce decent org data for Achilles, that itself is a finding. The snowball method works: start with one department, expand outward. Perfect is the enemy of good.

**"How do you optimize token usage?"**
[Be prepared to show awareness of AI costs — batch processing, caching parsed graphs, only using AI for initial parsing and final explanation, not for the core computation]
