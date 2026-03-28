// ---------------------------------------------------------------------------
// NEXUS API – shared TypeScript types
// Mirrors the shapes defined in docs/05_API.md
// ---------------------------------------------------------------------------

// ---- Graph primitives -----------------------------------------------------

export interface GraphNode {
  id: string;
  name: string;
  layer: string;
  /** Health (0–1) */
  h: number;
  /** Importance / theta (0–1) */
  theta: number;
  /** Recovery cost */
  r: number;
  /** Failed flag */
  phi: boolean;
  meta: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
}

export interface GraphData {
  layers: string[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---- Upload ---------------------------------------------------------------

export interface FileParsed {
  filename: string;
  type: string;
  chars_extracted: number;
}

export interface UploadResponse {
  session_id: string;
  files_parsed: FileParsed[];
  graph: GraphData;
  r_unit: string;
  confidence: number;
  gaps: string[];
  follow_up_questions: string[];
}

// ---- Graph update ---------------------------------------------------------

export interface GraphOperation {
  op: string;
  [key: string]: unknown;
}

export interface GraphUpdateResponse {
  graph: GraphData;
  validation_warnings: string[];
}

// ---- Analysis (Module 2) --------------------------------------------------

export interface NodeRanking {
  node_id: string;
  health_loss: number;
  cascade_size: number;
  cascade_depth: number;
  recovery_cost: number;
  layers_affected: number;
}

export interface CriticalEdge {
  from_node: string;
  to_node: string;
  health_loss: number;
  crosses_layers: boolean;
  weight: number;
}

export interface BridgeNode {
  node_id: string;
  splits_into: number;
  fragmentation_score: number;
  layer: string;
}

export interface ClusterInfo {
  nodes: string[];
  size: number;
  isolation_risk: number;
  boundary_nodes: string[];
  cluster_impact: number;
  layer_distribution: Record<string, number>;
}

export interface CompoundPair {
  node_a: string;
  node_b: string;
  impact_a: number;
  impact_b: number;
  impact_combined: number;
  synergy: number;
  synergy_ratio: number;
  same_layer: boolean;
}

export interface LayerAnalysis {
  node_count: number;
  autonomy: number;
  criticality: number;
  avg_theta: number;
  avg_recovery: number;
  layer_health: number;
  risk_score: number;
}

export interface VulnerabilityReport {
  network_health: number;
  node_rankings: NodeRanking[];
  critical_edges: CriticalEdge[];
  bridge_nodes: BridgeNode[];
  clusters: ClusterInfo[];
  compound_pairs: CompoundPair[];
  layer_analysis: Record<string, LayerAnalysis>;
  summary_stats: Record<string, unknown>;
}

export interface AnalyzeResponse {
  vulnerability_report: VulnerabilityReport;
  computation_time_ms: number;
}

// ---- Cascade (Module 2A) --------------------------------------------------

export interface CascadeEvent {
  target: string | string[];
  action: "kill" | "damage" | "cut_edge";
  magnitude?: number;
}

export interface CascadeStep {
  step: number;
  trigger: string;
  new_failures: string[];
  new_degraded: string[];
  damages: Record<string, number>;
}

export interface CascadeMetrics {
  cascade_size: number;
  cascade_depth: number;
  health_loss: number;
  nodes_failed: string[];
  nodes_degraded: string[];
  cross_layer_failures: number;
  layer_damage: Record<string, number>;
  total_recovery_cost: number;
}

export interface CascadeResponse {
  cascade_log: CascadeStep[];
  final_state: {
    nodes: { id: string; h: number; phi: boolean }[];
    H: number;
    H_per_layer: Record<string, number>;
  };
  metrics: CascadeMetrics;
}

// ---- Exploration (Modules 3 / 3A / 4) -------------------------------------

export interface ExploreConfig {
  max_depth?: number;
  max_tree_nodes?: number;
  worst_k?: number;
  agents?: string[];
}

export interface ScenarioPath {
  step: number;
  event: { target: string; action: string; magnitude: number } | null;
  H_before: number;
  H_after: number;
  new_failures: string[];
}

export interface Scenario {
  rank: number;
  severity: number;
  severity_label: string;
  title: string;
  summary: string;
  health_remaining: number;
  failed_nodes: string[];
  recovery_cost: number;
  depth: number;
  agent: string;
  path: ScenarioPath[];
  narrative: string;
  recommendations: { action: string; reason: string }[];
}

export interface Recommendation {
  priority: number;
  type: string;
  target: string;
  action: string;
  reason: string;
  estimated_resilience_gain: string;
  scenarios_prevented: number;
}

export interface TreeStats {
  total_nodes_explored: number;
  max_depth_reached: number;
  computation_time_ms: number;
  agent_stats: Record<
    string,
    { nodes_explored: number; worst_H_found: number }
  >;
}

export interface ExploreResponse {
  tree_stats: TreeStats;
  worst_scenarios: Scenario[];
  recommendations: Recommendation[];
  visualization_data: {
    graph: GraphData;
    state_tree: { nodes: unknown[]; edges: unknown[] };
    cascade_animations: unknown[];
  };
}

// ---- Report (Module 4A) ---------------------------------------------------

export interface ReportResponse {
  metadata: Record<string, unknown>;
  network_health: Record<string, unknown>;
  vulnerability_summary: Record<string, unknown>;
  worst_scenarios: Scenario[];
  recommendations: Recommendation[];
  visualization_data: unknown;
}

// ---- API error envelope ---------------------------------------------------

export interface ApiError {
  error: string;
  code: string;
}
