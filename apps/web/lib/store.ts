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
  GraphOperation,
  Recommendation,
  Scenario,
  TreeStats,
  VulnerabilityReport,
} from "./types";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface NexusState {
  // Session
  sessionId: string | null;

  // Graph
  graph: GraphData | null;

  // Upload state
  uploading: boolean;
  uploadError: string | null;
  uploadProgress: string | null;
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

const UPLOAD_STEP_DELAYS = [0, 2_000, 4_500, 8_000, 12_000, 17_000];

const INITIAL_UPLOAD = {
  uploading: false,
  uploadError: null as string | null,
  uploadProgress: null as string | null,
  uploadStepIndex: 0,
  uploadTotalSteps: UPLOAD_STEPS.length,
  gaps: [] as string[],
  followUpQuestions: [] as string[],
  confidence: null as number | null,
  driveFolder: null as DriveFolderSummary | null,
};

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
    set({
      ...INITIAL_UPLOAD,
      ...INITIAL_ANALYSIS,
      ...INITIAL_EXPLORE,
      uploading: true,
      uploadProgress: UPLOAD_STEPS[0],
      uploadStepIndex: 0,
      uploadTotalSteps: UPLOAD_STEPS.length,
      cascadeError: null,
      selectedNodeId: null,
      activeScenarioIndex: null,
    });

    // Simulated progress phases so the user sees activity during a long call.
    const timers = UPLOAD_STEPS.slice(1).map((label, i) =>
      setTimeout(
        () => set({ uploadProgress: label, uploadStepIndex: i + 1 }),
        UPLOAD_STEP_DELAYS[i + 1],
      ),
    );

    try {
      const res = await api.uploadFiles(files, description);

      set({
        sessionId: res.session_id,
        graph: res.graph,
        uploading: false,
        uploadProgress: null,
        confidence: res.confidence,
        gaps: res.gaps,
        followUpQuestions: res.follow_up_questions,
      });
    } catch (err: unknown) {
      set({
        uploading: false,
        uploadProgress: null,
        uploadError: api.extractErrorMessage(err),
      });
    } finally {
      timers.forEach(clearTimeout);
    }
  },

  importGoogleDriveFolder: async (accessToken, folderId, description) => {
    const driveSteps = [
      "Connecting to Google Drive...",
      "Scanning Google Drive files...",
      "Extracting entities...",
      "Building dependency graph...",
      "Mapping organizational layers...",
      "Finalizing structure...",
    ];
    const driveDelays = [0, 1_500, 4_000, 7_000, 11_000, 15_000];

    set({
      ...INITIAL_UPLOAD,
      ...INITIAL_ANALYSIS,
      ...INITIAL_EXPLORE,
      uploading: true,
      uploadProgress: driveSteps[0],
      uploadStepIndex: 0,
      uploadTotalSteps: driveSteps.length,
      cascadeError: null,
      selectedNodeId: null,
      activeScenarioIndex: null,
    });

    const timers = driveSteps.slice(1).map((label, i) =>
      setTimeout(
        () => set({ uploadProgress: label, uploadStepIndex: i + 1 }),
        driveDelays[i + 1],
      ),
    );

    try {
      const res = await api.importGoogleDriveFolder(
        accessToken,
        folderId,
        description,
      );

      set({
        sessionId: res.session_id,
        graph: res.graph,
        uploading: false,
        uploadProgress: null,
        confidence: res.confidence,
        gaps: res.gaps,
        followUpQuestions: res.follow_up_questions,
        driveFolder: res.drive_folder,
      });
      return true;
    } catch (err: unknown) {
      set({
        uploading: false,
        uploadProgress: null,
        uploadError: api.extractErrorMessage(err),
      });
      return false;
    } finally {
      timers.forEach(clearTimeout);
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
