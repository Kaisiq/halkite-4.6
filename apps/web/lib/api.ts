// ---------------------------------------------------------------------------
// NEXUS API client
// Thin wrapper around axios for every backend endpoint (docs/05_API.md).
// ---------------------------------------------------------------------------

import axios, { AxiosError, type AxiosInstance } from "axios";
import type {
  AnalyzeResponse,
  ApiError,
  CascadeEvent,
  CascadeResponse,
  ExploreConfig,
  ExploreResponse,
  GraphData,
  GraphOperation,
  GraphUpdateResponse,
  ReportResponse,
  UploadResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

const BASE_URL: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { Accept: "application/json" },
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/**
 * Extracts a human-readable message from an API error response.
 * Falls back to the generic axios message when the backend does not return
 * the standard `{ error, code }` envelope.
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as ApiError | undefined;
    if (data?.error) {
      return data.error;
    }
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

// ---------------------------------------------------------------------------
// Endpoint functions
// ---------------------------------------------------------------------------

/**
 * Upload files for data ingestion (Module 1).
 * POST /api/upload  –  multipart/form-data
 */
export async function uploadFiles(
  files: File[],
  description?: string,
): Promise<UploadResponse> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  if (description) {
    form.append("description", description);
  }
  const { data } = await client.post<UploadResponse>("/api/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/**
 * Manually update the graph (add/remove/edit nodes and edges).
 * POST /api/graph/update
 */
export async function updateGraph(
  sessionId: string,
  operations: GraphOperation[],
): Promise<GraphUpdateResponse> {
  const { data } = await client.post<GraphUpdateResponse>(
    "/api/graph/update",
    { session_id: sessionId, operations },
  );
  return data;
}

/**
 * Run weakpoint analysis (Module 2) on the current graph.
 * POST /api/analyze
 */
export async function analyze(sessionId: string): Promise<AnalyzeResponse> {
  const { data } = await client.post<AnalyzeResponse>("/api/analyze", {
    session_id: sessionId,
  });
  return data;
}

/**
 * Run a single cascade simulation (Module 2A).
 * POST /api/cascade
 */
export async function runCascade(
  sessionId: string,
  event: CascadeEvent,
): Promise<CascadeResponse> {
  const { data } = await client.post<CascadeResponse>("/api/cascade", {
    session_id: sessionId,
    event,
  });
  return data;
}

/**
 * Run full state-tree exploration (Modules 3, 3A, 4).
 * POST /api/explore
 */
export async function explore(
  sessionId: string,
  config?: ExploreConfig,
): Promise<ExploreResponse> {
  const { data } = await client.post<ExploreResponse>("/api/explore", {
    session_id: sessionId,
    config,
  });
  return data;
}

/**
 * Reset graph to initial state (all h = 1.0, all phi = false).
 * POST /api/reset
 */
export async function resetGraph(
  sessionId: string,
): Promise<{ graph: GraphData }> {
  const { data } = await client.post<{ graph: GraphData }>("/api/reset", {
    session_id: sessionId,
  });
  return data;
}

/**
 * Get current graph state.
 * GET /api/graph/{sessionId}
 */
export async function getGraph(
  sessionId: string,
): Promise<{ graph: GraphData }> {
  const { data } = await client.get<{ graph: GraphData }>(
    `/api/graph/${encodeURIComponent(sessionId)}`,
  );
  return data;
}

/**
 * Get the full final report (Module 4A output).
 * GET /api/report/{sessionId}
 */
export async function getReport(sessionId: string): Promise<ReportResponse> {
  const { data } = await client.get<ReportResponse>(
    `/api/report/${encodeURIComponent(sessionId)}`,
  );
  return data;
}
