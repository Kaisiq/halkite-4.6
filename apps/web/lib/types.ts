// ---------------------------------------------------------------------------
// Achilles API – shared TypeScript types
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

export type UploadJobStatus =
  | "queued"
  | "parsing"
  | "extracting"
  | "merging"
  | "refining"
  | "completed"
  | "failed";

export interface UploadJobResponse {
  session_id: string;
  job_id: string;
  status: UploadJobStatus;
}

export interface UploadJobState {
  job_id: string;
  session_id: string;
  status: UploadJobStatus;
  progress: number;
  stage_message: string;
  graph_preview: GraphData;
  metrics: Record<string, number>;
  error: string | null;
}

export type UploadJobEvent =
  | {
      type: "job_status";
      status: UploadJobStatus;
      progress: number;
      stage_message: string;
      metrics?: Record<string, number>;
    }
  | { type: "node_added"; node: GraphNode }
  | { type: "edge_added"; edge: GraphEdge }
  | { type: "graph_snapshot"; graph: GraphData }
  | ({ type: "job_complete"; drive_folder?: DriveFolderSummary } & UploadResponse)
  | { type: "job_error"; message: string };

export interface DriveFolderSummary {
  id: string;
  name: string;
  file_count: number;
  files_skipped: number;
}

export interface DriveImportResponse extends UploadResponse {
  drive_folder: DriveFolderSummary;
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

export type MonteCarloFailureModel =
  | "uniform"
  | "weighted_theta"
  | "per_node";

export interface ExploreMonteCarloConfig {
  failure_model?: MonteCarloFailureModel;
  kill_prob?: number;
  damage_prob?: number;
  damage_magnitude_min?: number;
  damage_magnitude_max?: number;
  branching_factor?: number;
  max_depth?: number;
  n_resilience_samples?: number;
  per_node_probs?: Record<string, number>;
}

export interface ExploreRequestOptions {
  config?: ExploreConfig;
  mc?: ExploreMonteCarloConfig;
}

export interface ScenarioPath {
  step: number;
  event:
    | {
        target: string | { from: string; to: string };
        action: string;
        magnitude: number;
      }
    | null;
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
  narrative:
    | string
    | {
        title?: string;
        summary?: string;
        narrative?: string;
        timeline?: Array<{ step?: number; description?: string }>;
        business_impact?: Record<string, unknown>;
        recommendations?: Array<Record<string, unknown>>;
      }
    | null;
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
  resilience_profile?: {
    mean_H?: number;
    std_H?: number;
    min_H?: number;
    max_H?: number;
    p_catastrophic?: number;
    p_severe?: number;
    n_samples?: number;
    layer_mean_damage?: Record<string, number>;
    per_node_failure_prob?: Record<string, number>;
    H_percentiles?: Record<string, number>;
    sample_H_values?: number[];
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

// ---- Chat -----------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  reply: string;
  history_length: number;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
}

// ---- Waitlist -------------------------------------------------------------

export interface WaitlistSignupResponse {
  status: "accepted" | "created" | "already_registered";
  message: string;
}

// ---- API error envelope ---------------------------------------------------

export interface ApiError {
  error: string;
  code: string;
}
