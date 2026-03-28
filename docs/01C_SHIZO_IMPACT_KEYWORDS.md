# Shizo Algo: Ultra-Extensive Node Impact Keyword Dictionary (V2)

This document provides a comprehensive, multi-domain dictionary of keywords used to identify and score node impact ($\theta$) and dependency weights within the Halkantir Shizo Algo. This version expands the scope to include specialized domains: IT, Finance, Human Capital, Supply Chain, and Legal/Regulatory.

---

## 1. Node Impact ($\theta$) Scoring Features: Deep Taxonomy

In the Halkantir model, $\theta$ represents the intrinsic importance or "fragility" of a node.

### A. Operational Criticality (Weight: 0.20)

_Determines if the node is a core part of the business mission or legal survival._

| Sub-Domain           | Keywords                                                                                                                                                                                                                                                                  |
| :------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Business Process** | `mission-critical`, `core service`, `backbone`, `revenue-generating`, `customer-facing`, `flagship product`, `tier-0`, `production-critical`, `line-of-business`, `operational-pillar`, `value-chain-link`, `transaction-critical`, `settlement-agent`, `clearing-house`. |
| **Legal/Regulatory** | `mandated`, `regulatory-requirement`, `compliance-gatekeeper`, `GDPR-sensitive`, `SOX-scope`, `PCI-DSS-node`, `licensed-entity`, `fiduciary-duty`, `statutory-obligation`, `audited-system`, `reporting-authority`, `governance-node`.                                    |
| **Strategy**         | `competitive-advantage`, `strategic-asset`, `intellectual-property`, `brand-differentiator`, `market-entry-point`, `unique-selling-proposition (USP)`, `innovation-hub`.                                                                                                  |

- **Research Backing:** **Ozesmi & Ozesmi (2004)** (Cognitive Mapping) and **Perrow (1984)** (Normal Accidents - "Tight Coupling" identifies these critical paths).

### B. Blast Radius (Weight: 0.30)

_Measures the potential for a failure to propagate widely through the network._

| Sub-Domain         | Keywords                                                                                                                                                                                                                       |
| :----------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Infrastructure** | `shared-service`, `foundational`, `enterprise-wide`, `global-namespace`, `authentication-provider`, `identity-store`, `root-certificate`, `gateway`, `nexus`, `backhaul`, `backbone-router`, `hypervisor`, `database-cluster`. |
| **Organizational** | `cross-functional`, `department-agnostic`, `universal-dependency`, `centralized-ops`, `shared-resource-pool`, `multi-tenant`, `aggregated-risk`, `inter-departmental-bridge`, `common-failure-point`.                          |
| **Data Gravity**   | `master-data-source`, `system-of-record`, `golden-record`, `data-lake`, `message-bus`, `event-stream`, `central-registry`, `metadata-store`, `lookup-service`, `global-config`.                                                |

- **Research Backing:** **Buldyrev et al. (2010)** (Interdependent Networks) and **Vespignani (2010)** (Fragility of Interdependent Networks).

### C. Irreplaceability / Substitutability (Weight: 0.25)

_Measures how hard it is to failover or replace the node._

| Sub-Domain        | Keywords                                                                                                                                                                                               |
| :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Human Capital** | `lone-wolf`, `siloed-knowledge`, `indispensable-person`, `subject-matter-expert (SME)`, `gatekeeper`, `tribal-knowledge`, `undocumented-process`, `single-threaded`, `key-man-risk`, `succession-gap`. |
| **Technology**    | `niche-stack`, `legacy-system`, `end-of-life (EOL)`, `proprietary-protocol`, `vendor-lock-in`, `custom-built`, `unsupported-hardware`, `bespoke-architecture`, `black-box`, `no-source-code`.          |
| **Supply Chain**  | `sole-source-supplier`, `monopoly`, `unique-location`, `geographical-concentration`, `limited-capacity`, `patent-protected`, `exclusive-license`, `non-fungible-resource`.                             |

- **Research Backing:** **Shao et al. (2017)** (Multiple Supply-Demand Links) and **Sheffi (2005)** (The Resilient Enterprise - "Redundancy vs Resilience").

### D. Recovery Penalty (Weight: 0.15)

_Measures the time and complexity required to restore the node._

| Sub-Domain             | Keywords                                                                                                                                                                                            |
| :--------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data Complexity**    | `stateful`, `high-data-gravity`, `massive-dataset`, `long-re-indexing-time`, `complex-consistency-checks`, `manual-reconciliation`, `write-heavy`, `synchronization-lag`, `cold-storage-retrieval`. |
| **Physical/Logistics** | `physical-access-required`, `hardware-lead-time`, `remote-site`, `off-site-backup`, `tape-restore`, `limited-bandwidth-recovery`, `site-visit-required`, `custom-parts`.                            |
| **Administrative**     | `regulatory-audit-pre-restart`, `manual-approval-chain`, `complex-configuration`, `environment-rebuild-required`, `dependency-ordering-constraints`, `high-MTTR`, `restart-penalty`.                |

- **Research Backing:** **Gao et al. (2016)** (Universal Resilience) and **Hollnagel (2011)** (Resilience Engineering).

### E. Historical Incident Impact (Weight: 0.10)

_Calibrates importance based on past observed failures._

| Type            | Keywords                                                                                                                                                           |
| :-------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Outage Data** | `outage`, `downtime`, `SLA-breach`, `service-interruption`, `post-mortem-report`, `incident-ticket`, `P1-incident`, `major-failure`, `degradation`, `instability`. |
| **Consequence** | `revenue-loss`, `customer-churn`, `reputational-damage`, `lawsuit`, `regulatory-fine`, `safety-incident`, `near-miss`, `data-leak`, `compliance-failure`.          |
| **Pattern**     | `repeat-offender`, `fragile-component`, `technical-debt`, `known-bottleneck`, `unstable-dependency`, `historical-weak-link`.                                       |

- **Research Backing:** **Wang et al. (2022)** (Bayesian Reconstruction) and **Reason (1990)** (Human Error / Swiss Cheese Model).

---

## 2. Dependency (Edge) Type Dictionary: Comprehensive Mapping

| Category            | Strength (Prior) | Expanded Keywords                                                                                                                             |
| :------------------ | :--------------: | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hard/Atomic**     |      0.95+       | `runs on`, `hosted on`, `virtualized by`, `deployed to`, `physical location`, `power source`, `direct hardware link`, `kernel-dependency`.    |
| **Structural/Code** |       0.90       | `depends on`, `requires`, `imports`, `calls synchronously`, `API-dependency`, `hardcoded-link`, `database-schema-link`, `library-dependency`. |
| **Data/Flow**       |       0.85       | `reads from`, `writes to`, `subscribes to`, `publishes to`, `ETL-source`, `data-lake-input`, `syncs with`, `replicates to`, `event-stream`.   |
| **Control/Auth**    |       0.70       | `authenticated by`, `authorized by`, `managed by`, `configured by`, `orchestrated by`, `governed by`, `policy-enforced by`.                   |
| **Support/Ops**     |       0.55       | `maintained by`, `monitored by`, `backed up to`, `logs to`, `owned by`, `audited by`, `supported by`, `troubleshot by`.                       |
| **Knowledge/Weak**  |       0.25       | `consults`, `notifies`, `works on`, `knows about`, `documents`, `related to`, `similar to`, `shares team with`.                               |

---

## 3. Advanced Contextual Clues for Impact Inference

Beyond simple keywords, the Shizo Algo looks for "contextual clusters":

1.  **The "Indispensability" Cluster:** When a node is mentioned in the same paragraph as `one-person-show`, `manual-override`, and `legacy-code`, its **Irreplaceability** score spikes.
2.  **The "Cascade Trigger" Cluster:** When a node is linked to `global-auth`, `single-database`, and `central-hub`, its **Blast Radius** score is multiplied.
3.  **The "Regulatory Trap" Cluster:** When a node is tagged with `GDPR`, `audit-trail`, and `compliance-officer`, its **Operational Criticality** is elevated regardless of its technical tier.
4.  **The "Data Gravity" Cluster:** When a node has high `storage-volume` and `write-IOPS` combined with `re-indexing`, its **Recovery Penalty** increases logarithmically.

---

## 4. Research Bibliography for Weights

1.  **Buldyrev, S. V., et al. (2010).** "Catastrophic cascade of failures in interdependent networks." _Nature_. (Blast Radius foundation).
2.  **Gao, J., Barzel, B., & Barabási, A. L. (2016).** "Universal resilience patterns in complex networks." _Nature_. (Recovery Penalty and GBB dynamics).
3.  **Ozesmi, U., & Ozesmi, S. L. (2004).** "Ecological models based on people’s knowledge." _Ecological Modelling_. (Operational Criticality via cognitive mapping).
4.  **Shao, J., et al. (2017).** "Cascading Failures in Interdependent Networks with Multiple Supply-Demand Links." _Scientific Reports_. (Irreplaceability and threshold dynamics).
5.  **Wang, Y., et al. (2022).** "A Bayesian Approach to Reconstructing Interdependent Infrastructure Networks." _arXiv_. (Historical Impact calibration).
6.  **Perrow, C. (1984).** "Normal Accidents: Living with High-Risk Technologies." (Systemic risk and tight coupling).
7.  **Sheffi, Y. (2005).** "The Resilient Enterprise." (Supply chain dependency weighting).
8.  **Hollnagel, E. (2011).** "Resilience Engineering in Practice." (Recovery and adaptive capacity).
9.  **Vespignani, A. (2010).** "The fragility of interdependency." _Nature_. (Network topology and cross-layer risk).
