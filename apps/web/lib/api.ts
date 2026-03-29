// ---------------------------------------------------------------------------
// Halkantir API client
// Thin wrapper around axios for every backend endpoint (docs/05_API.md).
// ---------------------------------------------------------------------------

import axios, { AxiosError, type AxiosInstance } from "axios";
import type {
  AnalyzeResponse,
  ApiError,
  CascadeEvent,
  CascadeResponse,
  ChatHistoryResponse,
  ChatResponse,
  DriveImportResponse,
  ExploreConfig,
  ExploreRequestOptions,
  ExploreResponse,
  GraphData,
  GraphOperation,
  GraphUpdateResponse,
  ReportResponse,
  UploadJobResponse,
  UploadJobState,
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

export async function createUploadJob(
  files: File[],
  description?: string,
): Promise<UploadJobResponse> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  if (description) {
    form.append("description", description);
  }
  const { data } = await client.post<UploadJobResponse>("/api/upload-jobs", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getUploadJob(jobId: string): Promise<UploadJobState> {
  const { data } = await client.get<UploadJobState>(
    `/api/upload-jobs/${encodeURIComponent(jobId)}`,
  );
  return data;
}

export async function importGoogleDriveFolder(
  accessToken: string,
  folderId: string,
  description?: string,
): Promise<DriveImportResponse> {
  const { data } = await client.post<DriveImportResponse>(
    "/api/google-drive/import",
    {
      access_token: accessToken,
      folder_id: folderId,
      description: description ?? "",
    },
  );
  return data;
}

export async function createGoogleDriveImportJob(
  accessToken: string,
  folderId: string,
  description?: string,
): Promise<UploadJobResponse> {
  const { data } = await client.post<UploadJobResponse>(
    "/api/google-drive/import-jobs",
    {
      access_token: accessToken,
      folder_id: folderId,
      description: description ?? "",
    },
  );
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
  const { data } = await client.post<GraphUpdateResponse>("/api/graph/update", {
    session_id: sessionId,
    operations,
  });
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
  options?: ExploreRequestOptions | ExploreConfig,
): Promise<ExploreResponse> {
  const payload =
    options && ("config" in options || "mc" in options)
      ? options
      : { config: options as ExploreConfig | undefined };
  const { data } = await client.post<ExploreResponse>("/api/explore", {
    session_id: sessionId,
    config: payload.config,
    mc: payload.mc,
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

/**
 * Send a chat message to the C-level executive advisor.
 * POST /api/chat
 */
export async function sendChatMessage(
  sessionId: string,
  message: string,
): Promise<ChatResponse> {
  const { data } = await client.post<ChatResponse>("/api/chat", {
    session_id: sessionId,
    message,
  });
  return data;
}

/**
 * Get chat history for a session.
 * GET /api/chat/history/{sessionId}
 */
export async function getChatHistory(
  sessionId: string,
): Promise<ChatHistoryResponse> {
  const { data } = await client.get<ChatHistoryResponse>(
    `/api/chat/history/${encodeURIComponent(sessionId)}`,
  );
  return data;
}

/**
 * Clear chat history for a session.
 * DELETE /api/chat/history/{sessionId}
 */
export async function clearChatHistory(sessionId: string): Promise<void> {
  await client.delete(`/api/chat/history/${encodeURIComponent(sessionId)}`);
}

/**
 * Get the WebSocket URL for streaming chat.
 */
export function getChatWsUrl(sessionId: string): string {
  const base = BASE_URL || window.location.origin;
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/ws/chat/${encodeURIComponent(sessionId)}`;
}

export function getUploadWsUrl(jobId: string): string {
  const base = BASE_URL || window.location.origin;
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/ws/upload/${encodeURIComponent(jobId)}`;
}
