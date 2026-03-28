// ---------------------------------------------------------------------------
// Halkantir – global Zustand store
// ---------------------------------------------------------------------------

import { create } from "zustand";
import * as api from "./api";
import type {
  CascadeEvent,
  CascadeResponse,
  DriveFolderSummary,
  ExploreConfig,
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

  // Cascade
  cascadeError: string | null;

  // UI state
  selectedNodeId: string | null;
  activeScenarioIndex: number | null;

  // Actions
  setSessionId: (id: string) => void;
  setGraph: (g: GraphData) => void;
  uploadFiles: (files: File[], description?: string) => Promise<void>;
  importGoogleDriveFolder: (
    accessToken: string,
    folderId: string,
    description?: string,
  ) => Promise<boolean>;
  runAnalysis: () => Promise<void>;
  runExploration: (config?: ExploreConfig) => Promise<void>;
  runCascade: (event: CascadeEvent) => Promise<CascadeResponse | null>;
  resetSession: () => Promise<void>;
  setSelectedNode: (id: string | null) => void;
  setActiveScenario: (index: number | null) => void;
  updateGraphOps: (ops: GraphOperation[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Initial (blank) values – useful for resetting slices of state
// ---------------------------------------------------------------------------

const INITIAL_UPLOAD = {
  uploading: false,
  uploadError: null as string | null,
  uploadProgress: null as string | null,
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
      uploadProgress: "Analyzing documents...",
      cascadeError: null,
      selectedNodeId: null,
      activeScenarioIndex: null,
    });

    // Simulated progress phases so the user sees activity during a long call.
    const t1 = setTimeout(
      () => set({ uploadProgress: "Extracting entities..." }),
      2_000,
    );
    const t2 = setTimeout(
      () => set({ uploadProgress: "Building dependency graph..." }),
      4_500,
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
      clearTimeout(t1);
      clearTimeout(t2);
    }
  },

  importGoogleDriveFolder: async (accessToken, folderId, description) => {
    set({
      ...INITIAL_UPLOAD,
      ...INITIAL_ANALYSIS,
      ...INITIAL_EXPLORE,
      uploading: true,
      uploadProgress: "Connecting to Google Drive...",
      cascadeError: null,
      selectedNodeId: null,
      activeScenarioIndex: null,
    });

    const t1 = setTimeout(
      () => set({ uploadProgress: "Scanning Google Drive files..." }),
      1_500,
    );
    const t2 = setTimeout(
      () => set({ uploadProgress: "Building dependency graph from Drive..." }),
      4_000,
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
      clearTimeout(t1);
      clearTimeout(t2);
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
}));
