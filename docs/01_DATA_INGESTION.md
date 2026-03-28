# Module 1 — Data Ingestion

## Purpose

Take whatever digital information the user dumps in and produce a valid Graph G as defined in Module 1A.

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

---

## Processing Pipeline

```
Step 1: PARSE FILES
    For each uploaded file:
        Extract raw text content
        Store as: {filename, type, content}
    
Step 2: CONCATENATE CONTEXT
    Combine all extracted text + user description into 
    a single context block

Step 3: AI GRAPH EXTRACTION
    Send context to Gemini with structured instructions
    Gemini outputs: JSON matching Graph schema from Module 1A

Step 4: VALIDATE
    Run all validation rules from Module 1A
    Fix or warn on issues

Step 5: RETURN GRAPH
    Valid Graph G ready for analysis
```

---

## File Parsing Details

### PDF
```
Library: PyPDF2 or pdfplumber
Extract: all text pages
If scanned/image PDF: use Gemini vision to read
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
Library: Pillow + Gemini API
Send image to Gemini with prompt:
"Extract all entities and relationships visible in this 
image (org chart, diagram, whiteboard, etc.)"
```

---

## AI Graph Extraction Prompt

This is the system prompt sent to Gemini for graph construction:

```
You are a network analyst. You will receive the contents of 
documents from an organization. Your job is to extract ALL 
entities and ALL dependencies between them, and construct a 
network graph.

OUTPUT FORMAT: Valid JSON only. No markdown. No explanation.

{
  "layers": ["People", "Technology", "Supply", ...],
  "nodes": [
    {
      "id": "unique_snake_case_id",
      "name": "Human Readable Name",
      "layer": "People",
      "h": 1.0,
      "theta": <float 0-1>,
      "r": <float>,
      "meta": {"role": "CEO", "location": "Sofia"}
    }
  ],
  "edges": [
    {
      "from": "node_id_1",
      "to": "node_id_2", 
      "weight": <float 0-1>
    }
  ]
}

RULES FOR NODE VALUES:

h (health): Always set to 1.0 for initial graph construction.
   The system will modify this during simulations.

θ (theta — network dependency): How critical is this node 
   to the overall network? Consider:
   - How many other nodes depend on it?
   - How hard is it to work around if this node disappears?
   - What fraction of operations/revenue/capability is lost?
   Examples:
     CEO of a small company: θ = 0.8-0.95
     Junior employee with common skills: θ = 0.05-0.15
     Single critical supplier: θ = 0.7-0.9
     One of many interchangeable suppliers: θ = 0.1-0.2
     Core database server: θ = 0.8-0.95
     Office printer: θ = 0.02-0.05

r (recovery cost): Time or money to replace/restore this node.
   Use consistent units (suggest: days for time, or currency).
   Examples:
     Replace a CEO: r = 180 (days) or r = 200000 (currency)
     Replace a junior employee: r = 14 (days)
     Switch supplier: r = 30 (days)
     Restore a server: r = 1 (day)
     Rebuild a destroyed office: r = 365 (days)
   
   Pick ONE unit system and state it in metadata.
   Default: days.

RULES FOR EDGES:

Direction: "from" is the node being depended ON.
           "to" is the node that DEPENDS on "from".
           from → to means "to needs from"

Weight: How strong is the dependency?
   1.0 = total dependency (if "from" dies, "to" cannot function)
   0.7-0.9 = strong dependency (major impact)
   0.4-0.6 = moderate dependency (significant but survivable)
   0.1-0.3 = weak dependency (minor inconvenience)

COMPLETENESS IS CRITICAL. It is better to include a questionable 
edge at low weight than to miss a real dependency entirely.

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

After AI returns JSON:

### 1. Parse and Validate
```python
graph = json.loads(ai_response)
validate_nodes(graph["nodes"])    # check ranges, uniqueness
validate_edges(graph["edges"])    # check references, no self-loops
validate_layers(graph["layers"])  # check all nodes reference valid layers
```

### 2. Build Adjacency Matrix
```python
n = len(graph["nodes"])
A = np.zeros((n, n))
for edge in graph["edges"]:
    i = node_index[edge["to"]]
    j = node_index[edge["from"]]
    A[i][j] = edge["weight"]
```

### 3. Connectivity Check
```python
G_nx = nx.from_numpy_array(A, create_using=nx.DiGraph)
if not nx.is_weakly_connected(G_nx):
    warn("Graph has disconnected components")
    # Report which nodes are isolated
```

### 4. Gap Detection
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

---

## AI Follow-Up Questions

After initial graph construction, scan for suspicious patterns and generate 2-3 targeted questions:

```
Triggers for follow-up:
1. Layer with only 1 node → "Is [layer] really just [node]? 
   Are there other [layer] components?"

2. Node with θ > 0.7 and no redundancy → "You have [node] as 
   a critical dependency. Is there a backup?"

3. All suppliers in same layer cluster → "Your suppliers [list] 
   seem independent. Do they share any common dependencies 
   (same country, same raw material source)?"

4. No cross-layer edges between two layers → "I don't see how 
   [layer A] and [layer B] are connected. Is there a dependency 
   I'm missing?"

5. Very few edges relative to nodes → "Your network seems 
   sparse. Are there dependencies I might have missed from 
   the documents?"
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
