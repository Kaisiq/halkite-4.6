# Module 1 — Data Ingestion

## Purpose

Take whatever digital information the user dumps in and produce a valid, evidence-backed Graph `G` as defined in Module 1A.

The research-backed rule for ingestion is:

- AI extracts candidate structure and scoring features
- deterministic backend logic computes final mathematical values
- human review resolves the highest-risk ambiguities
- historical incidents are used for calibration

---

## Input

User uploads one or more files of any type. The system accepts:

```
Documents:   .pdf, .docx, .txt, .md
Spreadsheets: .xlsx, .csv, .tsv
Images:      .png, .jpg (org charts, whiteboard photos, diagrams)
Data:        .json, .xml
```

Optionally, the user can also type a free-text description of their organization.

The user may also authorize a Google Drive folder. In that case, the system:

1. Recursively lists files in the selected folder and subfolders
2. Downloads supported binary files directly
3. Exports Google Docs / Sheets / Slides into parseable formats
4. Merges the resulting contents into the same ingestion context as uploads

---

## Processing Pipeline

```
Step 1: PARSE FILES
    For each uploaded file or Drive file:
        Extract raw text content
        Store as: {filename, type, content}

Step 2: CONCATENATE CONTEXT
    Combine all extracted text + user description into
    a single context block

Step 3: AI CANDIDATE EXTRACTION
    Send context to model with structured instructions
    Model outputs candidate nodes, candidate edges,
    evidence, and scoring features

Step 4: DETERMINISTIC SCORING
    Convert extracted features into θ, r, and edge weight
    using versioned backend formulas

Step 5: VALIDATE
    Run all validation and quality rules from Module 1A
    Fix, flag, or queue review on issues

Step 6: CALIBRATE
    Compare graph behavior to known incidents and outages
    Adjust formulas, features, or missing edges offline

Step 7: FREEZE GRAPH VERSION
    Store graph, scoring policy, evidence, and provenance

Step 8: RETURN GRAPH
    Valid Graph G ready for deterministic analysis
```

The default product flow now runs this pipeline as an asynchronous upload
job. The user receives a session immediately, then the frontend streams
real progress and incremental graph updates while Module 1 continues in the
background. Nodes may appear before the graph is fully finalized; the final
deterministic scoring and weight refinement step completes before the job is
marked done.

---

## File Parsing Details

### PDF

```
Library: PyPDF2 or pdfplumber
Extract: all text pages
If scanned/image PDF: use Claude vision to read
```

### DOCX

```
Library: python-docx
Extract: all paragraphs, tables, headers
Tables are especially valuable (employee lists, supplier tables)
```

### XLSX / CSV

```
Library: openpyxl / csv module
Extract: all sheets, all rows
Detect header rows automatically
Format as structured tables in text
```

### Images

```
Library: Pillow + Claude API
Send image to Claude with prompt:
"Extract all entities and relationships visible in this
image (org chart, diagram, whiteboard, etc.)"
```

---

## AI Candidate Extraction Prompt

This is the system prompt sent to the model for graph construction.

The key change is that the model no longer outputs final `theta` or final edge `weight` as pure intuition.

It outputs:

- candidate nodes
- candidate edges
- evidence
- scoring features
- confidence and uncertainty markers

```
You are a network analyst. You will receive the contents of
documents from an organization. Your job is to extract ALL
entities and ALL causal dependencies between them, and construct
an evidence-backed candidate graph.

OUTPUT FORMAT: Valid JSON only. No markdown. No explanation.

{
  "layers": ["People", "Technology", "Supply", ...],
  "scoring_policy_version": "v1",
  "nodes": [
    {
      "id": "unique_snake_case_id",
      "name": "Human Readable Name",
      "layer": "People",
      "h": 1.0,
      "r_candidate": <float or null>,
      "meta": {
        "type": "person",
        "function": "executive leadership",
        "owner": "board",
        "location": "Sofia",
        "capacity": null,
        "substitutability": <float 0-1 or null>,
        "max_tolerable_downtime_hours": <float or null>,
        "single_point_of_failure": <bool or null>,
        "evidence": [
          {
            "kind": "document",
            "source": "org_chart.pdf",
            "confidence": <float 0-1>,
            "note": "CEO oversees all functions"
          }
        ],
        "scoring_features": {
          "operational_criticality": <float 0-1 or null>,
          "irreplaceability": <float 0-1 or null>,
          "historical_incident_impact": <float 0-1 or null>
        }
      }
    }
  ],
  "edges": [
    {
      "from": "node_id_1",
      "to": "node_id_2",
      "meta": {
        "dependency_type": "operational",
        "directness": "direct",
        "substitutes_available": <int or null>,
        "time_to_substitute_hours": <float or null>,
        "minimum_support_required": <float 0-1 or null>,
        "evidence": [
          {
            "kind": "architecture_diagram",
            "source": "infra.drawio",
            "confidence": <float 0-1>,
            "note": "service B authenticates through service A"
          }
        ],
        "scoring_features": {
          "operational": <float 0-1 or null>,
          "informational": <float 0-1 or null>,
          "control": <float 0-1 or null>,
          "physical": <float 0-1 or null>,
          "financial": <float 0-1 or null>,
          "substitutability_penalty": <float 0-1 or null>,
          "workaround_delay": <float 0-1 or null>
        }
      }
    }
  ],
  "open_questions": ["short unresolved ambiguities"]
}

RULES FOR EXTRACTION:

h (health): Always set to 1.0 for initial graph construction.
   The system will modify this during simulations.

Do NOT output final theta values.
Instead, extract the evidence and scoring features the backend
will use to compute theta deterministically.

For recovery, provide `r_candidate` only when the source gives
enough evidence. Otherwise return null and explain uncertainty in
`open_questions`.

RULES FOR EDGES:

Direction: "from" is the node being depended ON.
           "to" is the node that DEPENDS on "from".
           from → to means "to needs from"

Do NOT output final edge weight.
Instead, output scoring features, evidence, and directness.

Only create an edge when there is a plausible causal dependency.
Do not create edges for mere co-occurrence, same department,
similarity, or communication alone.

COMPLETENESS IS IMPORTANT, but uncertainty must be explicit.
Prefer an inferred edge with evidence and low confidence over a
hallucinated high-confidence direct edge.

Think about these dependency types:
   - Who manages/supervises whom?
   - Who has knowledge that others need?
   - What systems depend on what infrastructure?
   - What processes require which people/tools?
   - What revenue depends on which clients/products?
   - What operations depend on which suppliers?
   - What facilities depend on which utilities/services?
   - Cross-layer: what people maintain what technology?
   - Cross-layer: what technology enables what operations?
   - Cross-layer: what suppliers feed what facilities?

LAYERS: Create layers based on what you see in the data.
Use the suggested defaults (People, Technology, Supply,
Financial, Facilities, Operations) where applicable, but
add or remove layers as the data warrants.
```

---

## Post-Processing

After the model returns candidate JSON:

### 1. Parse and Validate

```python
graph = json.loads(ai_response)
validate_nodes(graph["nodes"])    # check ranges, uniqueness
validate_edges(graph["edges"])    # check references, no self-loops
validate_layers(graph["layers"])  # check all nodes reference valid layers
```

### 2. Deterministic Scoring

```python
for node in graph["nodes"]:
    node["theta"] = score_theta(node["meta"]["scoring_features"], node["meta"])
    node["r"] = score_recovery(node["r_candidate"], node["meta"])

for edge in graph["edges"]:
    edge["weight"] = score_edge(edge["meta"]["scoring_features"], edge["meta"])
```

### 3. Build Adjacency Matrix

```python
n = len(graph["nodes"])
A = np.zeros((n, n))
for edge in graph["edges"]:
    i = node_index[edge["to"]]
    j = node_index[edge["from"]]
    A[i][j] = edge["weight"]
```

### 4. Connectivity Check

```python
G_nx = nx.from_numpy_array(A, create_using=nx.DiGraph)
if not nx.is_weakly_connected(G_nx):
    warn("Graph has disconnected components")
    # Report which nodes are isolated
```

### 5. Gap Detection

```python
# Find nodes with no incoming edges (nothing depends on them AND
# they depend on nothing)
for i, node in enumerate(nodes):
    in_degree = np.sum(A[i, :])   # how much this node depends on others
    out_degree = np.sum(A[:, i])  # how much others depend on this node
    if in_degree == 0 and out_degree == 0:
        flag_isolated(node)
    if out_degree == 0 and node.theta > 0.3:
        warn(f"Node {node.id} has high θ={node.theta} but nothing depends on it")
```

### 6. Calibration Against Known Incidents

```python
for incident in historical_incidents:
    predicted = simulate_incident(graph, incident)
    compare(predicted, incident.actual_outcome)
    # Use mismatches to find missing edges, bad weights,
    # or overstated substitutability assumptions
```

---

## AI Follow-Up Questions

After initial graph construction, scan for suspicious patterns and generate targeted questions:

```
Triggers for follow-up:
1. Layer with only 1 node → "Is [layer] really just [node]?
   Are there other [layer] components?"

2. Node with θ > 0.7 and no redundancy → "You have [node] as
   a critical dependency. Is there a backup?"

3. Edge inferred from weak evidence → "Does [target] actually
   depend on [source], or are they only related organizationally?"

4. All suppliers in same layer cluster → "Your suppliers [list]
   seem independent. Do they share any common dependencies
   (same country, same raw material source)?"

5. No cross-layer edges between two layers → "I don't see how
   [layer A] and [layer B] are connected. Is there a dependency
   I'm missing?"

6. Very few edges relative to nodes → "Your network seems
   sparse. Are there dependencies I might have missed from
   the documents?"

7. Historical incident not reproducible → "When [incident] happened,
   what actually broke next that is not represented in this graph?"
```

---

## Output

```python
{
    "graph": Graph,           # Valid graph per Module 1A
    "r_unit": "days",         # Unit system for recovery costs
    "confidence": 0.7,        # AI's self-assessed confidence in completeness
    "gaps": [                 # Suspected missing data
        "No technology infrastructure mentioned",
        "Supplier dependency weights are estimated"
    ],
    "follow_up_questions": [  # Optional questions to improve accuracy
        "Is there a backup for your main database server?"
    ]
}
```
