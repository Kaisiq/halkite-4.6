"""Module 1, Steps 2-5 -- AI Graph Extraction & Validation.

Takes parsed file contents, sends them to the Gemini API with a structured
system prompt, and constructs a validated ``Graph`` object.

References: docs/01_DATA_INGESTION.md, docs/01A_GRAPH_MODEL.md
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, cast

import numpy as np
from google import genai
from google.genai import types

from nexus_api.ingestion.parser import ParsedFile
from nexus_api.ingestion.scoring import (
    clamp,
    score_edge_weight,
    score_recovery,
    score_theta,
)
from nexus_api.models.graph import Edge, Graph, Node

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MODEL = "gemini-2.5-flash"

_SYSTEM_PROMPT = """\
You are a network analyst. You will receive the contents of documents from \
an organization. Your job is to extract ALL entities and ALL dependencies \
between them, and construct an evidence-backed candidate graph. Merge \
evidence across every file into one unified model.

OUTPUT FORMAT: Valid JSON only. No markdown. No explanation.

{
  "company": "Organization Name — brief description",
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
        "substitutability": <float 0-1 or null>,
        "max_tolerable_downtime_hours": <float or null>,
        "single_point_of_failure": <bool or null>,
        "evidence": [
          {
            "kind": "document",
            "source": "org_chart.pdf",
            "confidence": <float 0-1>,
            "note": "Why this node exists"
          }
        ],
        "scoring_features": {
          "blast_radius": <float 0-1 or null>,
          "operational_criticality": <float 0-1 or null>,
          "irreplaceability": <float 0-1 or null>,
          "recovery_penalty": <float 0-1 or null>,
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
        "directness": "direct | inferred | reconstructed",
        "substitutes_available": <int or null>,
        "time_to_substitute_hours": <float or null>,
        "minimum_support_required": <float 0-1 or null>,
        "evidence": [
          {
            "kind": "architecture_diagram",
            "source": "infra.drawio",
            "confidence": <float 0-1>,
            "note": "Why this edge exists"
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
  "r_unit": "days",
  "confidence": <float 0-1>,
  "known_risks": [
    "Risk description 1",
    "Risk description 2"
  ],
  "open_questions": ["Uncertain dependency or missing data"]
}

RULES FOR NODE VALUES:

h (health): Always set to 1.0 for initial graph construction.
   The system will modify this during simulations.

Do NOT output final theta values unless they are directly provided by the
source material. Extract scoring features and evidence instead.

r_candidate (recovery cost): only provide a direct numeric candidate when
the documents support it. Otherwise use null and describe the uncertainty.

RULES FOR EDGES:

Direction: "from" is the node being depended ON.
           "to" is the node that DEPENDS on "from".

Do NOT output final edge weights unless they are explicitly documented.
Extract scoring features, evidence, and directness instead.

Only create an edge when there is a plausible causal dependency.
Do not create edges for similarity, same team, or communication alone.

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

LAYERS: Create layers based on what you see in the data. Use the suggested \
defaults (People, Technology, Supply, Financial, Facilities, Operations) \
where applicable, but add or remove layers as the data warrants.

COMPANY: Set to the organization name and a brief description (e.g. \
"NovaTech Solutions — Digital Agency, Sofia, Bulgaria").

KNOWN RISKS: List any risks you identify from the data — single points \
of failure, concentration risks, missing redundancy, undocumented \
processes, etc.\
"""


# ---------------------------------------------------------------------------
# IngestResult
# ---------------------------------------------------------------------------


class IngestResult:
    """Outcome of the full ingestion pipeline.

    Attributes
    ----------
    graph : Graph
        Validated network graph ready for analysis.
    r_unit : str
        Unit system for recovery costs (default ``"days"``).
    confidence : float
        AI's self-assessed confidence in completeness (0-1).
    gaps : list[str]
        Suspected missing data / data quality issues.
    follow_up_questions : list[str]
        Targeted questions that could improve graph accuracy.
    files_parsed : list[dict]
        Per-file summary (``filename``, ``type``, ``chars_extracted``).
    standard : StandardFormat | None
        Validated standard format (for persistence).
    """

    __slots__ = (
        "confidence",
        "files_parsed",
        "follow_up_questions",
        "gaps",
        "graph",
        "r_unit",
        "standard",
    )

    def __init__(
        self,
        graph: Graph,
        r_unit: str = "days",
        confidence: float = 0.0,
        gaps: list[str] | None = None,
        follow_up_questions: list[str] | None = None,
        files_parsed: list[dict[str, Any]] | None = None,
        standard: Any | None = None,
    ) -> None:
        self.graph: Graph = graph
        self.r_unit: str = r_unit
        self.confidence: float = confidence
        self.gaps: list[str] = gaps if gaps is not None else []
        self.follow_up_questions: list[str] = (
            follow_up_questions if follow_up_questions is not None else []
        )
        self.files_parsed: list[dict[str, Any]] = files_parsed if files_parsed is not None else []
        self.standard = standard

    def to_dict(self) -> dict[str, Any]:
        return {
            "graph": self.graph.to_dict(),
            "r_unit": self.r_unit,
            "confidence": self.confidence,
            "gaps": list(self.gaps),
            "follow_up_questions": list(self.follow_up_questions),
            "files_parsed": list(self.files_parsed),
        }

    def __repr__(self) -> str:
        return (
            f"IngestResult(nodes={len(self.graph.nodes)}, "
            f"edges={len(self.graph.edges)}, "
            f"confidence={self.confidence:.2f}, "
            f"gaps={len(self.gaps)})"
        )


# ---------------------------------------------------------------------------
# Step 2: Build context
# ---------------------------------------------------------------------------


def build_context(parsed_files: list[ParsedFile], description: str = "") -> str:
    """Concatenate parsed file contents and user description into a single
    context block for the AI extraction prompt.

    Parameters
    ----------
    parsed_files:
        Output from :func:`nexus_api.ingestion.parser.parse_files`.
    description:
        Optional free-text description of the organisation.

    Returns
    -------
    str
        The full context string.
    """
    sections: list[str] = []

    if description.strip():
        sections.append(f"=== USER DESCRIPTION ===\n{description.strip()}")

    for pf in parsed_files:
        # Skip image-only entries (they will be sent as vision content blocks)
        if pf.raw_bytes is not None:
            sections.append(f"=== FILE: {pf.filename} (image — sent separately) ===")
            continue

        sections.append(f"=== FILE: {pf.filename} ({pf.file_type}) ===\n{pf.content}")

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Step 3: AI graph extraction
# ---------------------------------------------------------------------------


def _image_media_type(filename: str) -> str:
    """Return the MIME type for an image filename."""
    lower = filename.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "image/jpeg"
    return "image/png"  # safe fallback


def _build_user_content(
    context: str,
    image_data: list[tuple[str, bytes]] | None = None,
) -> list[str | types.Part]:
    """Assemble the content payload for the Gemini user message.

    Text context is always included. If *image_data* is provided, each image
    is added as an inline bytes part so Gemini can extract entities from
    diagrams and org charts.
    """
    blocks: list[str | types.Part] = []

    # Image blocks first so the model sees the visual context before the
    # aggregate text prompt.
    if image_data:
        for filename, raw in image_data:
            blocks.append(
                types.Part.from_bytes(
                    data=raw,
                    mime_type=_image_media_type(filename),
                )
            )
            blocks.append(
                f"The image above is from file '{filename}'. "
                "Extract all entities and relationships visible in this "
                "image (org chart, diagram, whiteboard, etc.)."
            )

    # Main text context block
    blocks.append(
        "Analyze the following documents and extract a complete dependency graph:\n\n" + context
    )

    return blocks


def _repair_truncated_json(text: str) -> str:
    """Attempt to repair truncated JSON by closing open structures.

    When the model response hits the token limit the JSON is cut mid-stream.
    This heuristic strips the trailing incomplete value/key and closes any
    open brackets and braces so that ``json.loads`` can succeed.
    """
    repaired = text.rstrip()

    # Iteratively strip trailing junk until we reach a structurally valid
    # truncation point (ends with a complete value, '}', ']', or '"').
    for _ in range(5):
        # Remove trailing comma, colon, whitespace
        repaired = re.sub(r'[,:\s]+$', '', repaired)

        # Check if we're inside an unclosed string
        in_string = False
        last_quote = -1
        i = 0
        while i < len(repaired):
            ch = repaired[i]
            if ch == '\\' and in_string:
                i += 2
                continue
            if ch == '"':
                in_string = not in_string
                last_quote = i
            i += 1

        if in_string and last_quote > 0:
            # Truncate at the opening quote of the incomplete string
            repaired = repaired[:last_quote]
            repaired = re.sub(r'[,:\s]+$', '', repaired)
            continue

        # If we end with a bare key ("key" with no colon/value after it),
        # strip it too — look for pattern: `"somekey"` at end after a `,`
        stripped_end = re.sub(r',\s*"[^"]*"\s*$', '', repaired)
        if stripped_end != repaired:
            repaired = stripped_end
            continue

        break

    # Close any remaining open brackets/braces in correct LIFO order
    stack: list[str] = []
    in_str = False
    j = 0
    while j < len(repaired):
        ch = repaired[j]
        if ch == '\\' and in_str:
            j += 2
            continue
        if ch == '"':
            in_str = not in_str
        elif not in_str:
            if ch in ('{', '['):
                stack.append('}' if ch == '{' else ']')
            elif ch in ('}', ']'):
                if stack:
                    stack.pop()
        j += 1

    repaired += ''.join(reversed(stack))

    return repaired


def _extract_json_from_response(text: str) -> dict[str, Any]:
    """Robustly extract a JSON object from the model response text.

    The model may wrap the JSON in markdown fences or include preamble text
    despite the system prompt instructions.  This function handles those
    cases gracefully.  When the response appears truncated (e.g. the model
    hit max_output_tokens), it attempts to repair the JSON by closing open
    structures.
    """
    # Try direct parse first
    stripped = text.strip()
    if stripped.startswith("{"):
        try:
            return json.loads(stripped)  # type: ignore[no-any-return]
        except json.JSONDecodeError:
            pass

    # Try extracting from markdown code fence
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", stripped, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())  # type: ignore[no-any-return]
        except json.JSONDecodeError:
            pass

    # Try finding the first { ... } block (string-aware depth tracking)
    brace_start = stripped.find("{")
    if brace_start != -1:
        depth = 0
        in_str = False
        i = brace_start
        while i < len(stripped):
            ch = stripped[i]
            if ch == '\\' and in_str:
                i += 2
                continue
            if ch == '"':
                in_str = not in_str
            elif not in_str:
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        candidate = stripped[brace_start : i + 1]
                        try:
                            return json.loads(candidate)  # type: ignore[no-any-return]
                        except json.JSONDecodeError:
                            break
            i += 1

    # Last resort: try to repair truncated JSON
    if brace_start is not None and brace_start != -1:
        candidate = stripped[brace_start:]
        repaired = _repair_truncated_json(candidate)
        try:
            result = json.loads(repaired)  # type: ignore[no-any-return]
            logger.warning(
                "JSON response appeared truncated; repaired by closing open structures"
            )
            return result
        except json.JSONDecodeError:
            pass

    raise ValueError(
        f"Could not extract valid JSON from AI response. Response starts with: {stripped[:200]!r}"
    )


def _response_text(response: types.GenerateContentResponse) -> str:
    """Extract plain text from a Gemini response."""
    text = getattr(response, "text", None)
    if text:
        return cast("str", text)

    parts: list[str] = []
    for candidate in response.candidates or []:
        content = getattr(candidate, "content", None)
        if not content:
            continue
        for part in content.parts or []:
            part_text = getattr(part, "text", None)
            if part_text:
                parts.append(part_text)
    return "".join(parts)


async def extract_graph(
    context: str,
    image_data: list[tuple[str, bytes]] | None = None,
) -> dict[str, Any]:
    """Call the Gemini API to extract a network graph from the context.

    Parameters
    ----------
    context:
        Concatenated text context from :func:`build_context`.
    image_data:
        Optional list of ``(filename, raw_bytes)`` for images to be sent
        to Gemini as inline image parts.

    Returns
    -------
    dict
        Raw parsed JSON dict with ``layers``, ``nodes``, ``edges``, and
        optionally ``r_unit`` and ``confidence``.

    Raises
    ------
    ValueError
        If the AI response cannot be parsed as valid JSON.
    Exception
        If the API call itself fails.
    """
    api_key = os.environ["GEMINI_API_KEY"]
    client = genai.Client(api_key=api_key)

    user_content = _build_user_content(context, image_data)

    response = await client.aio.models.generate_content(
        model=_MODEL,
        contents=cast("Any", user_content),
        config=types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
            temperature=0,
            max_output_tokens=65536,
            response_mime_type="application/json",
        ),
    )

    response_text = _response_text(response)
    if not response_text.strip():
        raise ValueError("Gemini returned an empty response")

    return _extract_json_from_response(response_text)


# ---------------------------------------------------------------------------
# Step 4: Build and validate Graph
# ---------------------------------------------------------------------------


def build_graph_from_dict(data: dict[str, Any]) -> Graph:
    """Construct a validated :class:`Graph` from AI-generated JSON.

    This function is deliberately lenient: it clamps out-of-range values,
    removes invalid edges, and deduplicates rather than raising exceptions.
    This ensures that even imperfect AI output produces a usable graph.

    Parameters
    ----------
    data:
        Raw dict as returned by :func:`extract_graph`.

    Returns
    -------
    Graph
        A structurally valid graph (may still have validation warnings).
    """
    r_unit = str(data.get("r_unit", "days"))
    scoring_policy = data.get("scoring_policy")
    if not isinstance(scoring_policy, dict):
        scoring_policy = {}

    # --- Layers ---
    layers: list[str] = [str(item) for item in data.get("layers", [])]

    # --- Nodes ---
    nodes: list[Node] = []
    seen_ids: set[str] = set()

    for raw_node in data.get("nodes", []):
        node_id = str(raw_node.get("id", ""))
        if not node_id:
            logger.warning("Skipping node with empty id: %s", raw_node)
            continue

        # Deduplicate
        if node_id in seen_ids:
            logger.warning("Skipping duplicate node id: %s", node_id)
            continue
        seen_ids.add(node_id)

        name = str(raw_node.get("name", node_id))
        layer = str(raw_node.get("layer", ""))

        # Ensure the layer is in the layers list
        if layer and layer not in layers:
            layers.append(layer)

        meta = raw_node.get("meta")
        if not isinstance(meta, dict):
            meta = {}

        # Clamp / derive mathematical values
        h = clamp(float(raw_node.get("h", 1.0)), 0.0, 1.0)
        if raw_node.get("theta") is None:
            theta = score_theta(meta.get("scoring_features"), meta)
        else:
            theta = clamp(float(raw_node.get("theta", 0.0)), 0.0, 1.0)

        if raw_node.get("r") is None:
            r = score_recovery(raw_node.get("r_candidate"), meta, r_unit=r_unit)
        else:
            r = max(float(raw_node.get("r", 0.0)), 0.0)

        nodes.append(
            Node(
                id=node_id,
                name=name,
                layer=layer,
                h=h,
                theta=theta,
                r=r,
                meta=meta,
            )
        )

    # --- Edges ---
    node_id_set = {n.id for n in nodes}
    edges: list[Edge] = []
    seen_pairs: set[tuple[str, str]] = set()

    for raw_edge in data.get("edges", []):
        from_id = str(raw_edge.get("from", ""))
        to_id = str(raw_edge.get("to", ""))

        # Skip invalid references
        if from_id not in node_id_set:
            logger.warning("Dropping edge: from_id %r not in graph nodes", from_id)
            continue
        if to_id not in node_id_set:
            logger.warning("Dropping edge: to_id %r not in graph nodes", to_id)
            continue

        # No self-loops
        if from_id == to_id:
            logger.warning("Dropping self-loop on node %r", from_id)
            continue

        # No duplicates
        pair = (from_id, to_id)
        if pair in seen_pairs:
            logger.warning("Dropping duplicate edge %r -> %r", from_id, to_id)
            continue
        seen_pairs.add(pair)

        raw_meta = raw_edge.get("meta")
        meta_for_scoring = raw_meta if isinstance(raw_meta, dict) else {}

        # Clamp weight into (0, 1]; drop zero-weight edges
        if raw_edge.get("weight") is None:
            weight = score_edge_weight(
                meta_for_scoring.get("scoring_features"),
                meta_for_scoring,
            )
        else:
            weight = clamp(float(raw_edge.get("weight", 1.0)), 0.0, 1.0)
        if weight <= 0.0:
            logger.warning("Dropping zero-weight edge %r -> %r", from_id, to_id)
            continue

        edges.append(
            Edge(
                from_id=from_id,
                to_id=to_id,
                weight=weight,
                meta=raw_meta,
            )
        )

    graph = Graph(
        nodes=nodes,
        edges=edges,
        layers=layers,
        scoring_policy=scoring_policy,
    )

    # Phase 2: Refine prior weights using topology-aware inference
    try:
        from nexus_api.engine.weight_inference import refine_weights

        refine_weights(graph)
    except (ValueError, np.linalg.LinAlgError, RuntimeError) as exc:
        logger.warning("Weight inference failed (using priors): %s", exc, exc_info=True)

    return graph


# ---------------------------------------------------------------------------
# Step 4 (cont.): Gap detection
# ---------------------------------------------------------------------------


def detect_gaps(graph: Graph) -> tuple[list[str], list[str]]:
    """Scan the graph for suspicious patterns and generate follow-up
    questions per the spec.

    Parameters
    ----------
    graph:
        A constructed (possibly imperfect) graph.

    Returns
    -------
    tuple[list[str], list[str]]
        ``(gaps, follow_up_questions)``
    """
    gaps: list[str] = []
    questions: list[str] = []

    if not graph.nodes:
        gaps.append("Graph contains no nodes")
        return gaps, questions

    # -- 1. Layer with only 1 node --
    layer_counts: dict[str, list[str]] = {}
    for node in graph.nodes:
        layer_counts.setdefault(node.layer, []).append(node.name)

    for layer, names in layer_counts.items():
        if len(names) == 1:
            gaps.append(f"Layer '{layer}' has only 1 node: {names[0]}")
            questions.append(
                f"Is '{layer}' really just '{names[0]}'? "
                f"Are there other {layer.lower()} components?"
            )

    # -- 2. High-theta node with no redundancy --
    # A node has "no redundancy" if no other node in the same layer has
    # comparable theta (within 0.3 of it).
    for node in graph.nodes:
        if node.theta > 0.7:
            peers = [
                n
                for n in graph.nodes
                if n.layer == node.layer and n.id != node.id and n.theta >= node.theta - 0.3
            ]
            if not peers:
                gaps.append(
                    f"'{node.name}' (theta={node.theta:.2f}) is a critical "
                    f"dependency with no redundancy in layer '{node.layer}'"
                )
                questions.append(
                    f"'{node.name}' is a critical dependency "
                    f"(theta={node.theta:.2f}). Is there a backup or fallback?"
                )

    # -- 3. No cross-layer edges between two layers --
    cross_layer_pairs: set[tuple[str, str]] = set()
    node_layer_map: dict[str, str] = {n.id: n.layer for n in graph.nodes}

    for edge in graph.edges:
        l_from = node_layer_map.get(edge.from_id, "")
        l_to = node_layer_map.get(edge.to_id, "")
        if l_from and l_to and l_from != l_to:
            pair = tuple(sorted([l_from, l_to]))
            cross_layer_pairs.add(pair)  # type: ignore[arg-type]

    all_layers = list(layer_counts.keys())
    for i in range(len(all_layers)):
        for j in range(i + 1, len(all_layers)):
            pair = tuple(sorted([all_layers[i], all_layers[j]]))
            if pair not in cross_layer_pairs:
                gaps.append(f"No cross-layer edges between '{all_layers[i]}' and '{all_layers[j]}'")
                questions.append(
                    f"I don't see how '{all_layers[i]}' and "
                    f"'{all_layers[j]}' are connected. "
                    f"Is there a dependency I'm missing?"
                )

    # -- 4. Very few edges relative to nodes --
    n_nodes = len(graph.nodes)
    n_edges = len(graph.edges)
    # A minimal connected graph on n nodes has (n-1) edges.
    # Anything significantly below n is suspicious.
    if n_nodes >= 3 and n_edges < n_nodes - 1:
        gaps.append(
            f"Very few edges ({n_edges}) relative to nodes ({n_nodes}). Network seems sparse."
        )
        questions.append(
            "Your network seems sparse. Are there dependencies I "
            "might have missed from the documents?"
        )

    # -- 5. High-theta node with nothing depending on it --
    depended_on: set[str] = {e.from_id for e in graph.edges}
    for node in graph.nodes:
        if node.theta > 0.3 and node.id not in depended_on:
            gaps.append(f"'{node.name}' has high theta={node.theta:.2f} but nothing depends on it")

    return gaps, questions


# ---------------------------------------------------------------------------
# Step 5: Full pipeline
# ---------------------------------------------------------------------------


async def ingest(
    files: list[tuple[str, bytes]],
    description: str = "",
) -> IngestResult:
    """Run the complete ingestion pipeline.

    Two paths:

    **Fast path** — If any uploaded ``.json`` file is already in the Halkantir
    standard format, skip AI extraction entirely and build the graph
    directly from it.

    **Slow path** — Parse all files, call Gemini for graph extraction,
    normalise the output to the standard format, then build the graph.

    In both cases the validated :class:`StandardFormat` is attached to the
    result so the caller can persist it.

    Parameters
    ----------
    files:
        List of ``(filename, raw_bytes)`` tuples.
    description:
        Optional free-text description of the organisation.

    Returns
    -------
    IngestResult
    """
    from nexus_api.ingestion.parser import parse_files
    from nexus_api.ingestion.standard import (
        StandardFormat,
        detect_standard_format,
        normalize_ai_output,
    )

    # ------------------------------------------------------------------
    # Fast path: check if any JSON file is already in standard format
    # ------------------------------------------------------------------
    standard: StandardFormat | None = None
    standard_filename: str = ""
    for filename, content in files:
        if filename.lower().endswith(".json"):
            standard = detect_standard_format(content)
            if standard is not None:
                standard_filename = filename
                logger.info(
                    "Detected standard format in %s — skipping AI extraction",
                    filename,
                )
                break

    if standard is not None:
        graph = build_graph_from_dict(standard.model_dump(by_alias=True))

        validation = graph.validate()
        if validation.errors:
            logger.warning("Graph validation errors (standard): %s", validation.errors)
        if validation.warnings:
            logger.info("Graph validation warnings: %s", validation.warnings)

        gaps, follow_up_questions = detect_gaps(graph)

        return IngestResult(
            graph=graph,
            r_unit=standard.r_unit,
            confidence=1.0,
            gaps=gaps,
            follow_up_questions=follow_up_questions,
            files_parsed=[
                {
                    "filename": standard_filename,
                    "type": "json",
                    "chars_extracted": len(standard.model_dump_json(by_alias=True)),
                }
            ],
            standard=standard,
        )

    # ------------------------------------------------------------------
    # Slow path: parse -> AI extraction -> normalise -> build graph
    # ------------------------------------------------------------------

    # Step 1: Parse
    parsed = parse_files(files)

    # Step 2: Build context
    context = build_context(parsed, description)

    # Collect image data for vision
    image_data: list[tuple[str, bytes]] = [
        (pf.filename, pf.raw_bytes) for pf in parsed if pf.raw_bytes is not None
    ]

    # Step 3: AI extraction
    raw = await extract_graph(
        context,
        image_data=image_data if image_data else None,
    )

    # Step 3b: Normalise AI output to standard format
    standard = normalize_ai_output(
        raw,
        company=description,
    )

    # Step 4: Build graph
    graph = build_graph_from_dict(raw)

    # Run validation and log warnings
    validation = graph.validate()
    if validation.errors:
        logger.warning("Graph validation errors (post-build): %s", validation.errors)
    if validation.warnings:
        logger.info("Graph validation warnings: %s", validation.warnings)

    # Step 4 (cont.): Detect gaps
    gaps, follow_up_questions = detect_gaps(graph)

    # Extract metadata from AI response
    r_unit = str(raw.get("r_unit", "days"))
    confidence = clamp(float(raw.get("confidence", 0.0)), 0.0, 1.0)

    # Build per-file summary
    files_parsed = [pf.to_dict() for pf in parsed]

    return IngestResult(
        graph=graph,
        r_unit=r_unit,
        confidence=confidence,
        gaps=gaps,
        follow_up_questions=follow_up_questions,
        files_parsed=files_parsed,
        standard=standard,
    )
