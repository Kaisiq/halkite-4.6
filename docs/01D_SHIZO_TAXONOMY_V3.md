# Shizo Algo: High-Dimensional Semantic Taxonomy (V3 - Ultra-Scale)

This document outlines the **High-Dimensional Semantic Taxonomy** for node impact analysis in the Halkantir Shizo Algo. This version moves beyond a simple keyword list into a hierarchical tree of concepts, synonyms, and contextual triggers.

---

## 1. The Semantic Tree Structure

The taxonomy is organized as a multi-level tree. Each node in the tree represents a **Resilience Concept** and contains:

- **Primary Keywords:** Technical and canonical terms.
- **Synonyms & Slang:** Informal or alternative phrasing found in documents.
- **Contextual Triggers:** Phrases or "n-grams" that imply the concept.
- **Exclusion Terms:** Terms that might look similar but imply _low_ impact.

---

## 2. Domain-Specific Verticals (Expanded)

### 🩺 Healthcare & Biotech

- **Impact Markers:** `patient-safety`, `clinical-trial-integrity`, `HIPAA-compliance`, `cold-chain-logistics`, `bio-hazard-containment`, `emergency-room-ops`.
- **Dependencies:** `LIMS-system`, `EMR-access`, `sterilization-protocol`, `specialized-pathology-lab`.

### 🏦 Fintech & High-Frequency Trading

- **Impact Markers:** `latency-arbitrage`, `clearing-and-settlement`, `liquidity-injection`, `regulatory-capital-ratio`, `KYC/AML-pipeline`, `transaction-ledger`.
- **Dependencies:** `SWIFT-gateway`, `market-data-feed`, `order-matching-engine`, `compliance-audit-log`.

### 🚢 Logistics & Supply Chain

- **Impact Markers:** `just-in-time (JIT)`, `cross-docking`, `last-mile-delivery`, `intermodal-transfer`, `customs-brokerage`, `warehousing-capacity`.
- **Dependencies:** `port-authority`, `freight-forwarder`, `cold-storage-sensor`, `inventory-reconciliation`.

### ⚡ Energy & Utilities

- **Impact Markers:** `grid-stability`, `baseload-capacity`, `frequency-regulation`, `SCADA-integrity`, `environmental-discharge`, `public-safety-shutoff`.
- **Dependencies:** `transmission-line`, `sub-station`, `fuel-supply-contract`, `emergency-generator`.

---

## 3. The 10-Dimensional Impact Map

The Shizo Algo now evaluates nodes across 10 distinct semantic dimensions (expanding the original 5):

1.  **Mission Criticality:** Survival of the core business function.
2.  **Blast Radius:** Horizontal propagation potential.
3.  **Data Gravity:** Difficulty of moving or restoring state.
4.  **Knowledge Scarcity:** Reliance on specialized human capital.
5.  **Regulatory Liability:** Exposure to fines or legal shutdown.
6.  **Revenue Connectivity:** Proximity to primary income streams.
7.  **Technical Debt/Fragility:** Age and stability of the node.
8.  **Physical Dependency:** Reliance on site-specific assets or utilities.
9.  **Substitutability:** Availability of drop-in replacements.
10. **Historical Vulnerability:** Record of previous failure or near-misses.

---

## 4. Siphoned vs. Non-Siphoned Phraseology

The Shizo Algo distinguishes between **Siphoned** (colloquial/informal/slang) and **Non-Siphoned** (formal/canonical/standard) phrases. This mapping allows the engine to extract deterministic signals from informal communication (Slack logs, ticket comments, emails).

| Siphoned Phrase       | Non-Siphoned (Formal)               | Primary Dimension   |
| :-------------------- | :---------------------------------- | :------------------ |
| `only guy who knows`  | `Human Single Point of Failure`     | Irreplaceability    |
| `house of cards`      | `High Risk of Cascading Failure`    | Blast Radius        |
| `flying blind`        | `Lack of Operational Observability` | Hist. Vulnerability |
| `duct-taped together` | `High Technical Debt / Fragility`   | Hist. Vulnerability |
| `bus factor of one`   | `Knowledge Concentration Risk`      | Irreplaceability    |
| `zombie service`      | `Deprecated Legacy Component`       | Irreplaceability    |
| `ticking time bomb`   | `Deterministic Failure Point`       | Hist. Vulnerability |
| `crown jewels`        | `Primary Strategic Business Asset`  | Mission Criticality |

The full mapping is available in `apps/api/src/nexus_api/ingestion/shizo_siphoned_dictionary.json`.

---

## 5. Large-Scale Taxonomy JSON (Reference)

The full taxonomy is stored in `apps/api/src/nexus_api/ingestion/shizo_taxonomy_v3.json`. It contains **over 1,000 unique semantic markers**.

### Example: "Irreplaceability" Node

```json
{
  "concept": "Knowledge Scarcity",
  "keywords": ["SME", "expert", "lone wolf", "tribal knowledge"],
  "synonyms": [
    "specialist",
    "guru",
    "only one who knows",
    "key man",
    "single-threaded resource"
  ],
  "contextual_triggers": [
    "rely solely on",
    "undocumented knowledge",
    "manual override required",
    "no backup personnel",
    "hard to recruit for",
    "specialized skillset"
  ],
  "exclusion_terms": [
    "standardized",
    "outsourced",
    "automated",
    "commodity skill"
  ]
}
```

---

## 5. Research Backing (Expanded Bibliography)

- **Perrow, C. (1984).** _Normal Accidents_. (Tight coupling and linear vs. complex interactions).
- **Hollnagel, E. (2011).** _Resilience Engineering_. (Adaptive capacity and anticipation).
- **Sheffi, Y. (2005).** _The Resilient Enterprise_. (Flexibility and redundancy in supply chains).
- **Vespignani, A. (2010).** _The Fragility of Interdependency_. (Network topology risk).
- **Adler, P. S. (1995).** _Building Better Bureaucracies_. (Process standardization and resilience).
- **Gunderson, L. H. (2001).** _Panarchy: Understanding Transformations in Human and Natural Systems_. (Cross-scale interactions).
- **Shao, J. et al. (2017).** _Cascading Failures with Supply-Demand Links_. (Threshold-based criticality).
- **Buldyrev, S. V. et al. (2010).** _Interdependent Networks_. (Foundational cascade theory).
- **Wang, Y. et al. (2022).** _Bayesian Network Reconstruction_. (Historical calibration).
- **HRO Theory (Weick & Sutcliffe, 2001).** _Managing the Unexpected_. (Mindfulness and preoccupation with failure).
