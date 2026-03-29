// ---------------------------------------------------------------------------
// Halkantir – global Zustand store
// ---------------------------------------------------------------------------

import { create } from "zustand";
import * as api from "./api";
import type {
  CascadeEvent,
  CascadeResponse,
  ChatMessage,
  DriveFolderSummary,
  ExploreConfig,
  ExploreRequestOptions,
  ExploreResponse,
  GraphData,
  GraphEdge,
  GraphNode,
  GraphOperation,
  Recommendation,
  Scenario,
  TreeStats,
  UploadJobEvent,
  UploadJobStatus,
  UploadResponse,
  VulnerabilityReport,
} from "./types";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface NexusState {
  // Session
  sessionId: string | null;
  uploadJobId: string | null;

  // Graph
  graph: GraphData | null;

  // Upload state
  uploading: boolean;
  uploadError: string | null;
  uploadProgress: string | null;
  uploadStatus: UploadJobStatus | null;
  uploadStageMessage: string | null;
  uploadProgressValue: number;
  graphBuildState: "idle" | "building" | "complete" | "failed";
  uploadStepIndex: number;
  uploadTotalSteps: number;
  gaps: string[];
  followUpQuestions: string[];
  confidence: number | null;
  driveFolder: DriveFolderSummary | null;

  // Analysis
  vulnerabilityReport: VulnerabilityReport | null;
  analyzing: boolean;
  analysisError: string | null;

  // Exploration
  exploring: boolean;
  exploreError: string | null;
  scenarios: Scenario[];
  recommendations: Recommendation[];
  treeStats: TreeStats | null;
  vizData: ExploreResponse["visualization_data"] | null;
  resilienceProfile: ExploreResponse["resilience_profile"] | null;

  // Cascade
  cascadeError: string | null;

  // Chat
  chatMessages: ChatMessage[];
  chatSending: boolean;
  chatError: string | null;

  // UI state
  selectedNodeId: string | null;
  activeScenarioIndex: number | null;

  // Actions
  setSessionId: (_id: string) => void;
  setGraph: (_g: GraphData) => void;
  uploadFiles: (_files: File[], _description?: string) => Promise<void>;
  importGoogleDriveFolder: (
    _accessToken: string,
    _folderId: string,
    _description?: string,
  ) => Promise<boolean>;
  runAnalysis: () => Promise<void>;
  runExploration: (
    _options?: ExploreRequestOptions | ExploreConfig,
  ) => Promise<void>;
  runCascade: (_event: CascadeEvent) => Promise<CascadeResponse | null>;
  resetSession: () => Promise<void>;
  setSelectedNode: (_id: string | null) => void;
  setActiveScenario: (_index: number | null) => void;
  updateGraphOps: (_ops: GraphOperation[]) => Promise<void>;
  sendChatMessage: (_message: string) => Promise<void>;
  loadChatHistory: () => Promise<void>;
  clearChat: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Initial (blank) values – useful for resetting slices of state
// ---------------------------------------------------------------------------

const UPLOAD_STEPS = [
  "Analyzing documents...",
  "Extracting entities...",
  "Building dependency graph...",
  "Mapping organizational layers...",
  "Calculating dependencies...",
  "Finalizing structure...",
] as const;

const DRIVE_UPLOAD_STEPS = [
  "Connecting to Google Drive...",
  "Scanning Google Drive files...",
  "Extracting entities...",
  "Building dependency graph...",
  "Mapping organizational layers...",
  "Finalizing structure...",
] as const;

function clampStepIndex(stepIndex: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  return Math.max(0, Math.min(stepIndex, totalSteps - 1));
}

function statusToStepIndex(status: UploadJobStatus, totalSteps: number): number {
  switch (status) {
    case "queued":
      return 0;
    case "parsing":
      return clampStepIndex(1, totalSteps);
    case "extracting":
      return clampStepIndex(2, totalSteps);
    case "merging":
      return clampStepIndex(3, totalSteps);
    case "refining":
      return clampStepIndex(4, totalSteps);
    case "completed":
      return clampStepIndex(totalSteps - 1, totalSteps);
    case "failed":
      return clampStepIndex(totalSteps - 2, totalSteps);
  }
}

const INITIAL_UPLOAD = {
  uploading: false,
  uploadError: null as string | null,
  uploadProgress: null as string | null,
  uploadStatus: null as UploadJobStatus | null,
  uploadStageMessage: null as string | null,
  uploadProgressValue: 0,
  graphBuildState: "idle" as "idle" | "building" | "complete" | "failed",
  uploadStepIndex: 0,
  uploadTotalSteps: UPLOAD_STEPS.length,
  gaps: [] as string[],
  followUpQuestions: [] as string[],
  confidence: null as number | null,
  driveFolder: null as DriveFolderSummary | null,
};

let uploadSocket: WebSocket | null = null;
let previewNodeQueue: GraphNode[] = [];
let previewEdgeQueue: GraphEdge[] = [];
let previewFlushTimer: number | null = null;
let pendingUploadCompletion:
  | (UploadResponse & {
      drive_folder?: DriveFolderSummary;
    })
  | null = null;

function closeUploadSocket(): void {
  if (uploadSocket) {
    uploadSocket.close();
    uploadSocket = null;
  }
}

function resetPreviewQueues(): void {
  previewNodeQueue = [];
  previewEdgeQueue = [];
  pendingUploadCompletion = null;
  if (previewFlushTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(previewFlushTimer);
  }
  previewFlushTimer = null;
}

function completeUploadReveal(): void {
  const completion = pendingUploadCompletion;
  if (!completion) {
    return;
  }
  pendingUploadCompletion = null;
  const { uploadTotalSteps } = useNexusStore.getState();
  useNexusStore.setState({
    sessionId: completion.session_id,
    graph: completion.graph,
    uploading: false,
    uploadStatus: "completed",
    uploadStageMessage: "Graph ready",
    uploadProgress: null,
    uploadProgressValue: 1,
    graphBuildState: "complete",
    uploadStepIndex: statusToStepIndex("completed", uploadTotalSteps),
    confidence: completion.confidence,
    gaps: completion.gaps,
    followUpQuestions: completion.follow_up_questions,
    driveFolder: completion.drive_folder ?? null,
  });
  closeUploadSocket();
}

function mergePreviewGraph(
  current: GraphData | null,
  node?: GraphNode,
  edge?: GraphEdge,
): GraphData {
  const base: GraphData = current ?? { layers: [], nodes: [], edges: [] };
  const layers = new Set(base.layers);
  const nodes = [...base.nodes];
  const edges = [...base.edges];

  if (node && !nodes.some((existing) => existing.id === node.id)) {
    nodes.push(node);
    layers.add(node.layer);
  }

  if (
    edge &&
    !edges.some(
      (existing) => existing.from === edge.from && existing.to === edge.to,
    ) &&
    nodes.some((existing) => existing.id === edge.from) &&
    nodes.some((existing) => existing.id === edge.to)
  ) {
    edges.push(edge);
  }

  return {
    layers: Array.from(layers),
    nodes,
    edges,
  };
}

function flushPreviewQueues(): void {
  previewFlushTimer = null;
  const nextNode = previewNodeQueue.shift();
  if (nextNode) {
    useNexusStore.setState((state) => ({
      graph: mergePreviewGraph(state.graph, nextNode),
    }));
  } else {
    const nextEdge = previewEdgeQueue.shift();
    if (nextEdge) {
      const state = useNexusStore.getState();
      const graph = state.graph;
      const hasFrom = graph?.nodes.some((node) => node.id === nextEdge.from);
      const hasTo = graph?.nodes.some((node) => node.id === nextEdge.to);
      if (hasFrom && hasTo) {
        useNexusStore.setState((current) => ({
          graph: mergePreviewGraph(current.graph, undefined, nextEdge),
        }));
      } else {
        previewEdgeQueue.push(nextEdge);
      }
    }
  }

  if (previewNodeQueue.length > 0 || previewEdgeQueue.length > 0) {
    previewFlushTimer = window.setTimeout(flushPreviewQueues, 140);
    return;
  }

  completeUploadReveal();
}

function enqueuePreviewNode(node: GraphNode): void {
  const currentGraph = useNexusStore.getState().graph;
  if (
    currentGraph?.nodes.some((existing) => existing.id === node.id) ||
    previewNodeQueue.some((existing) => existing.id === node.id)
  ) {
    return;
  }
  previewNodeQueue.push(node);
  if (previewFlushTimer === null && typeof window !== "undefined") {
    previewFlushTimer = window.setTimeout(flushPreviewQueues, 0);
  }
}

function enqueuePreviewEdge(edge: GraphEdge): void {
  const currentGraph = useNexusStore.getState().graph;
  if (
    currentGraph?.edges.some(
      (existing) => existing.from === edge.from && existing.to === edge.to,
    ) ||
    previewEdgeQueue.some(
      (existing) => existing.from === edge.from && existing.to === edge.to,
    )
  ) {
    return;
  }
  previewEdgeQueue.push(edge);
  if (previewFlushTimer === null && typeof window !== "undefined") {
    previewFlushTimer = window.setTimeout(flushPreviewQueues, 0);
  }
}

const INITIAL_ANALYSIS = {
  vulnerabilityReport: null as VulnerabilityReport | null,
  analyzing: false,
  analysisError: null as string | null,
};

const INITIAL_EXPLORE = {
  exploring: false,
  exploreError: null as string | null,
  scenarios: [] as Scenario[],
  recommendations: [] as Recommendation[],
  treeStats: null as TreeStats | null,
  vizData: null as ExploreResponse["visualization_data"] | null,
  resilienceProfile: null as ExploreResponse["resilience_profile"] | null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useNexusStore = create<NexusState>()((set, get) => ({
  // -- Session ---------------------------------------------------------------
  sessionId: null,
  uploadJobId: null,

  // -- Graph -----------------------------------------------------------------
  graph: null,

  // -- Upload ----------------------------------------------------------------
  ...INITIAL_UPLOAD,

  // -- Analysis --------------------------------------------------------------
  ...INITIAL_ANALYSIS,

  // -- Exploration -----------------------------------------------------------
  ...INITIAL_EXPLORE,

  // -- Cascade ---------------------------------------------------------------
  cascadeError: null,

  // -- Chat -----------------------------------------------------------------
  chatMessages: [],
  chatSending: false,
  chatError: null,

  // -- UI --------------------------------------------------------------------
  selectedNodeId: null,
  activeScenarioIndex: null,

  // ==========================================================================
  // Actions
  // ==========================================================================

  setSessionId: (id) => set({ sessionId: id }),
  setGraph: (g) => set({ graph: g }),

  /**
   * Upload files, obtain a session and the initial graph.
   * Clears any prior analysis / exploration results.
   */
  uploadFiles: async (files, description) => {
    closeUploadSocket();
    resetPreviewQueues();
    set({
      ...INITIAL_UPLOAD,
      ...INITIAL_ANALYSIS,
      ...INITIAL_EXPLORE,
      uploadJobId: null,
      graph: { layers: [], nodes: [], edges: [] },
      uploading: true,
      uploadProgress: "Queueing upload...",
      uploadStatus: "queued",
      uploadStageMessage: "Queueing upload...",
      uploadProgressValue: 0,
      graphBuildState: "building",
      uploadStepIndex: 0,
      uploadTotalSteps: UPLOAD_STEPS.length,
      cascadeError: null,
      selectedNodeId: null,
      activeScenarioIndex: null,
    });
    try {
      const res = await api.createUploadJob(files, description);
      set({
        sessionId: res.session_id,
        uploadJobId: res.job_id,
      });

      if (typeof window !== "undefined") {
        const connectUploadSocket = (jobId: string) => {
          const socket = new WebSocket(api.getUploadWsUrl(jobId));
          uploadSocket = socket;

          socket.onopen = () => {
            socket.send(JSON.stringify({ action: "subscribe" }));
          };

          socket.onmessage = (message) => {
            const event = JSON.parse(message.data) as UploadJobEvent;

            if (event.type === "job_status") {
              const uploadTotalSteps = get().uploadTotalSteps;
              set({
                uploadStatus: event.status,
                uploadStageMessage: event.stage_message,
                uploadProgress: event.stage_message,
                uploadProgressValue: event.progress,
                uploadStepIndex: statusToStepIndex(
                  event.status,
                  uploadTotalSteps,
                ),
                graphBuildState:
                  event.status === "failed"
                    ? "failed"
                    : event.status === "completed"
                      ? "complete"
                      : "building",
              });
              return;
            }

            if (event.type === "node_added") {
              enqueuePreviewNode(event.node);
              return;
            }

            if (event.type === "edge_added") {
              enqueuePreviewEdge(event.edge);
              return;
            }

            if (event.type === "graph_snapshot") {
              const current = get().graph;
              if (event.graph.nodes.length > 0) {
                set((state) => ({
                  uploadProgressValue: Math.max(state.uploadProgressValue, 0.2),
                }));
                for (const node of event.graph.nodes) {
                  enqueuePreviewNode(node);
                }
                for (const edge of event.graph.edges) {
                  enqueuePreviewEdge(edge);
                }
                if ((current?.nodes.length ?? 0) > 0) {
                  return;
                }
              }
              if ((current?.nodes.length ?? 0) === 0 && event.graph.nodes.length <= 1) {
                set({ graph: event.graph });
              }
              return;
            }

            if (event.type === "job_complete") {
              const currentGraph = get().graph;
              pendingUploadCompletion = event;
              const uploadTotalSteps = get().uploadTotalSteps;
              set((state) => ({
                uploadStatus: "refining",
                uploadStageMessage: "Rendering final graph",
                uploadProgress: "Rendering final graph",
                uploadProgressValue: Math.max(state.uploadProgressValue, 0.9),
                uploadStepIndex: statusToStepIndex(
                  "refining",
                  uploadTotalSteps,
                ),
              }));
              for (const node of event.graph.nodes) {
                if (!currentGraph?.nodes.some((existing) => existing.id === node.id)) {
                  enqueuePreviewNode(node);
                }
              }
              for (const edge of event.graph.edges) {
                if (
                  !currentGraph?.edges.some(
                    (existing) => existing.from === edge.from && existing.to === edge.to,
                  )
                ) {
                  enqueuePreviewEdge(edge);
                }
              }
              if (
                previewNodeQueue.length === 0 &&
                previewEdgeQueue.length === 0 &&
                previewFlushTimer === null
              ) {
                completeUploadReveal();
              }
              return;
            }

            if (event.type === "job_error") {
              set({
                uploading: false,
                uploadError: event.message,
                uploadStatus: "failed",
                uploadStageMessage: "Graph build failed",
                uploadProgress: null,
                graphBuildState: "failed",
              });
              closeUploadSocket();
            }
          };

          socket.onclose = async () => {
            if (uploadSocket !== socket) {
              return;
            }
            uploadSocket = null;
            const state = get();
            if (!state.uploading || state.uploadJobId !== jobId) {
              return;
            }
            try {
              const job = await api.getUploadJob(jobId);
              const uploadTotalSteps = get().uploadTotalSteps;
              set({
                uploadStatus: job.status,
                uploadStageMessage: job.stage_message,
                uploadProgress: job.stage_message,
                uploadProgressValue: job.progress,
                uploadStepIndex: statusToStepIndex(
                  job.status,
                  uploadTotalSteps,
                ),
                graph: job.graph_preview,
                graphBuildState:
                  job.status === "failed"
                    ? "failed"
                    : job.status === "completed"
                      ? "complete"
                      : "building",
              });
              if (job.status === "completed" || job.status === "failed") {
                if (job.status === "failed") {
                  resetPreviewQueues();
                }
                return;
              }
              window.setTimeout(() => {
                const latest = get();
                if (latest.uploading && latest.uploadJobId === jobId && !uploadSocket) {
                  connectUploadSocket(jobId);
                }
              }, 500);
            } catch (err: unknown) {
              set({
                uploading: false,
                uploadError: api.extractErrorMessage(err),
                uploadStatus: "failed",
                graphBuildState: "failed",
              });
            }
          };
        };

        connectUploadSocket(res.job_id);
      }
    } catch (err: unknown) {
      set({
        uploading: false,
        uploadProgress: null,
        uploadError: api.extractErrorMessage(err),
        uploadStatus: "failed",
        graphBuildState: "failed",
      });
    }
  },

  importGoogleDriveFolder: async (accessToken, folderId, description) => {
    closeUploadSocket();
    resetPreviewQueues();
    set({
      ...INITIAL_UPLOAD,
      ...INITIAL_ANALYSIS,
      ...INITIAL_EXPLORE,
      uploadJobId: null,
      graph: { layers: [], nodes: [], edges: [] },
      uploading: true,
      uploadProgress: "Connecting to Google Drive...",
      uploadStatus: "queued",
      uploadStageMessage: "Connecting to Google Drive...",
      uploadProgressValue: 0,
      graphBuildState: "building",
      uploadStepIndex: 0,
      uploadTotalSteps: DRIVE_UPLOAD_STEPS.length,
      cascadeError: null,
      selectedNodeId: null,
      activeScenarioIndex: null,
    });
    try {
      const res = await api.createGoogleDriveImportJob(
        accessToken,
        folderId,
        description,
      );

      set({
        sessionId: res.session_id,
        uploadJobId: res.job_id,
      });

      if (typeof window !== "undefined") {
        const connectUploadSocket = (jobId: string) => {
          const socket = new WebSocket(api.getUploadWsUrl(jobId));
          uploadSocket = socket;

          socket.onopen = () => {
            socket.send(JSON.stringify({ action: "subscribe" }));
          };

          socket.onmessage = (message) => {
            const event = JSON.parse(message.data) as UploadJobEvent;

            if (event.type === "job_status") {
              const uploadTotalSteps = get().uploadTotalSteps;
              set({
                uploadStatus: event.status,
                uploadStageMessage: event.stage_message,
                uploadProgress: event.stage_message,
                uploadProgressValue: event.progress,
                uploadStepIndex: statusToStepIndex(
                  event.status,
                  uploadTotalSteps,
                ),
                graphBuildState:
                  event.status === "failed"
                    ? "failed"
                    : event.status === "completed"
                      ? "complete"
                      : "building",
              });
              return;
            }

            if (event.type === "node_added") {
              enqueuePreviewNode(event.node);
              return;
            }

            if (event.type === "edge_added") {
              enqueuePreviewEdge(event.edge);
              return;
            }

            if (event.type === "graph_snapshot") {
              const current = get().graph;
              if (event.graph.nodes.length > 0) {
                set((state) => ({
                  uploadProgressValue: Math.max(state.uploadProgressValue, 0.2),
                }));
                for (const node of event.graph.nodes) {
                  enqueuePreviewNode(node);
                }
                for (const edge of event.graph.edges) {
                  enqueuePreviewEdge(edge);
                }
                if ((current?.nodes.length ?? 0) > 0) {
                  return;
                }
              }
              if ((current?.nodes.length ?? 0) === 0 && event.graph.nodes.length <= 1) {
                set({ graph: event.graph });
              }
              return;
            }

            if (event.type === "job_complete") {
              const currentGraph = get().graph;
              pendingUploadCompletion = event;
              const uploadTotalSteps = get().uploadTotalSteps;
              set((state) => ({
                uploadStatus: "refining",
                uploadStageMessage: "Rendering final graph",
                uploadProgress: "Rendering final graph",
                uploadProgressValue: Math.max(state.uploadProgressValue, 0.9),
                uploadStepIndex: statusToStepIndex(
                  "refining",
                  uploadTotalSteps,
                ),
              }));
              for (const node of event.graph.nodes) {
                if (!currentGraph?.nodes.some((existing) => existing.id === node.id)) {
                  enqueuePreviewNode(node);
                }
              }
              for (const edge of event.graph.edges) {
                if (
                  !currentGraph?.edges.some(
                    (existing) => existing.from === edge.from && existing.to === edge.to,
                  )
                ) {
                  enqueuePreviewEdge(edge);
                }
              }
              if (
                previewNodeQueue.length === 0 &&
                previewEdgeQueue.length === 0 &&
                previewFlushTimer === null
              ) {
                completeUploadReveal();
              }
              return;
            }

            if (event.type === "job_error") {
              set({
                uploading: false,
                uploadError: event.message,
                uploadStatus: "failed",
                uploadStageMessage: "Drive import failed",
                uploadProgress: null,
                graphBuildState: "failed",
              });
              closeUploadSocket();
            }
          };

          socket.onclose = async () => {
            if (uploadSocket !== socket) {
              return;
            }
            uploadSocket = null;
            const state = get();
            if (!state.uploading || state.uploadJobId !== jobId) {
              return;
            }
            try {
              const job = await api.getUploadJob(jobId);
              const uploadTotalSteps = get().uploadTotalSteps;
              set({
                uploadStatus: job.status,
                uploadStageMessage: job.stage_message,
                uploadProgress: job.stage_message,
                uploadProgressValue: job.progress,
                uploadStepIndex: statusToStepIndex(
                  job.status,
                  uploadTotalSteps,
                ),
                graph: job.graph_preview,
                graphBuildState:
                  job.status === "failed"
                    ? "failed"
                    : job.status === "completed"
                      ? "complete"
                      : "building",
              });
              if (job.status === "completed" || job.status === "failed") {
                if (job.status === "failed") {
                  resetPreviewQueues();
                }
                return;
              }
              window.setTimeout(() => {
                const latest = get();
                if (latest.uploading && latest.uploadJobId === jobId && !uploadSocket) {
                  connectUploadSocket(jobId);
                }
              }, 500);
            } catch (err: unknown) {
              set({
                uploading: false,
                uploadError: api.extractErrorMessage(err),
                uploadStatus: "failed",
                graphBuildState: "failed",
              });
            }
          };
        };

        connectUploadSocket(res.job_id);
      }
      return true;
    } catch (err: unknown) {
      set({
        uploading: false,
        uploadProgress: null,
        uploadError: api.extractErrorMessage(err),
        uploadStatus: "failed",
        uploadStageMessage: "Drive import failed",
        graphBuildState: "failed",
      });
      return false;
    }
  },

  /**
   * Run weakpoint analysis (Module 2) on the current graph.
   */
  runAnalysis: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    set({ analyzing: true, analysisError: null });

    try {
      const res = await api.analyze(sessionId);
      set({
        vulnerabilityReport: res.vulnerability_report,
        analyzing: false,
      });
    } catch (err: unknown) {
      set({
        analyzing: false,
        analysisError: api.extractErrorMessage(err),
      });
    }
  },

  /**
   * Run the full state-tree exploration (Modules 3, 3A, 4).
   */
  runExploration: async (config) => {
    const { sessionId } = get();
    if (!sessionId) return;

    set({ exploring: true, exploreError: null });

    try {
      const res = await api.explore(sessionId, config);

      set({
        exploring: false,
        scenarios: res.worst_scenarios,
        recommendations: res.recommendations,
        treeStats: res.tree_stats,
        vizData: res.visualization_data,
        resilienceProfile: res.resilience_profile ?? null,
      });
    } catch (err: unknown) {
      set({
        exploring: false,
        exploreError: api.extractErrorMessage(err),
      });
    }
  },

  /**
   * Trigger a single cascade simulation.
   * Updates the graph with the resulting final state and returns the full
   * response so callers can drive animations.
   */
  runCascade: async (event) => {
    const { sessionId } = get();
    if (!sessionId) return null;

    set({ cascadeError: null });

    try {
      const res = await api.runCascade(sessionId, event);

      // Apply post-cascade node states to the local graph.
      const currentGraph = get().graph;
      if (currentGraph && res.final_state?.nodes) {
        const nodeMap = new Map(res.final_state.nodes.map((n) => [n.id, n]));
        const updatedNodes = currentGraph.nodes.map((n) => {
          const updated = nodeMap.get(n.id);
          return updated ? { ...n, h: updated.h, phi: updated.phi } : n;
        });
        set({ graph: { ...currentGraph, nodes: updatedNodes } });
      }

      return res;
    } catch (err: unknown) {
      set({ cascadeError: api.extractErrorMessage(err) });
      return null;
    }
  },

  /**
   * Reset the graph to its initial healthy state and clear derived results.
   */
  resetSession: async () => {
    closeUploadSocket();
    resetPreviewQueues();
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      const { graph } = await api.resetGraph(sessionId);

      set({
        graph,
        ...INITIAL_ANALYSIS,
        ...INITIAL_EXPLORE,
        cascadeError: null,
        selectedNodeId: null,
        activeScenarioIndex: null,
      });
    } catch {
      // Reset is best-effort; the user can retry.
    }
  },

  /**
   * Select a node in the graph (or deselect with null).
   */
  setSelectedNode: (id) => {
    set({ selectedNodeId: id });
  },

  /**
   * Highlight a scenario card (or deselect with null).
   */
  setActiveScenario: (index) => {
    set({ activeScenarioIndex: index });
  },

  /**
   * Apply manual graph operations (add/remove/edit nodes & edges).
   */
  updateGraphOps: async (ops) => {
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      const res = await api.updateGraph(sessionId, ops);
      set({ graph: res.graph });

      if (res.validation_warnings.length > 0) {
        console.warn(
          "[Halkantir] Graph update warnings:",
          res.validation_warnings,
        );
      }
    } catch (err: unknown) {
      set({ uploadError: api.extractErrorMessage(err) });
    }
  },

  /**
   * Send a message to the C-level executive chat advisor.
   */
  sendChatMessage: async (message) => {
    const { sessionId } = get();
    if (!sessionId) return;

    const userMsg: ChatMessage = { role: "user", content: message };
    set((state) => ({
      chatMessages: [...state.chatMessages, userMsg],
      chatSending: true,
      chatError: null,
    }));

    try {
      const res = await api.sendChatMessage(sessionId, message);
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.reply,
      };
      set((state) => ({
        chatMessages: [...state.chatMessages, assistantMsg],
        chatSending: false,
      }));
    } catch (err: unknown) {
      set({
        chatSending: false,
        chatError: api.extractErrorMessage(err),
      });
    }
  },

  /**
   * Load chat history from the server.
   */
  loadChatHistory: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      const res = await api.getChatHistory(sessionId);
      set({ chatMessages: res.messages });
    } catch {
      // Non-critical — start fresh
    }
  },

  /**
   * Clear all chat history.
   */
  clearChat: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      await api.clearChatHistory(sessionId);
      set({ chatMessages: [], chatError: null });
    } catch {
      // Best effort
    }
  },
}));
