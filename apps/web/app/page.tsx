"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { useNexusStore } from "@/lib/store";

const ACCEPT_TYPES = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".csv",
  ".tsv",
  ".png",
  ".jpg",
  ".json",
  ".xml",
  ".txt",
  ".md",
];

const ACCEPT_STRING = ACCEPT_TYPES.join(",");
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

type GoogleTokenResponse = {
  access_token: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleTokenError = {
  message?: string;
  type?: string;
};

type DriveFolderNode = {
  id: string;
  name: string;
};

type GoogleAccounts = {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (response: GoogleTokenResponse) => void;
      error_callback?: (error: GoogleTokenError) => void;
    }) => GoogleTokenClient;
  };
};

type GoogleWindow = Window & {
  google?: {
    accounts?: GoogleAccounts;
  };
};

const PIPELINE_STEPS = [
  {
    id: "01",
    title: "Ingest",
    detail: "Upload rosters, org charts, spreadsheets, notes, and diagrams.",
  },
  {
    id: "02",
    title: "Map",
    detail: "Build a dependency graph across people, systems, and operations.",
  },
  {
    id: "03",
    title: "Stress",
    detail: "Run weakpoint analysis and adversarial cascade exploration.",
  },
  {
    id: "04",
    title: "Rank",
    detail: "Surface the catastrophic paths worth fixing first.",
  },
] as const;

const SIGNALS = [
  "Graph-native analysis",
  "Weakpoint ranking",
  "Cascade simulation",
] as const;

const PREVIEW_NODES = [
  { name: "CEO", x: 108, y: 68, size: 22, color: "var(--layer-people)" },
  { name: "CTO", x: 196, y: 118, size: 16, color: "var(--layer-people)" },
  { name: "COO", x: 122, y: 180, size: 15, color: "var(--layer-people)" },
  { name: "Platform", x: 268, y: 86, size: 14, color: "var(--layer-tech)" },
  { name: "Sales", x: 252, y: 196, size: 13, color: "var(--layer-ops)" },
  {
    name: "Finance",
    x: 332,
    y: 148,
    size: 12,
    color: "var(--layer-financial)",
  },
] as const;

const PREVIEW_EDGES = [
  { from: 0, to: 1 },
  { from: 0, to: 2 },
  { from: 1, to: 3 },
  { from: 2, to: 4 },
  { from: 1, to: 5 },
  { from: 3, to: 5 },
] as const;

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

const TYPE_COLORS: Record<string, string> = {
  pdf: "bg-red-500/12 text-red-200 border-red-400/20",
  docx: "bg-blue-500/12 text-blue-200 border-blue-400/20",
  xlsx: "bg-emerald-500/12 text-emerald-200 border-emerald-400/20",
  csv: "bg-emerald-500/12 text-emerald-200 border-emerald-400/20",
  tsv: "bg-emerald-500/12 text-emerald-200 border-emerald-400/20",
  png: "bg-cyan-500/12 text-cyan-200 border-cyan-400/20",
  jpg: "bg-cyan-500/12 text-cyan-200 border-cyan-400/20",
  json: "bg-amber-500/12 text-amber-200 border-amber-400/20",
  xml: "bg-orange-500/12 text-orange-200 border-orange-400/20",
  txt: "bg-white/8 text-slate-200 border-white/10",
  md: "bg-white/8 text-slate-200 border-white/10",
};

function badgeClass(ext: string): string {
  return TYPE_COLORS[ext] ?? "bg-white/8 text-slate-200 border-white/10";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayDriveFolderLabel(value: string): string {
  if (!value.trim()) return "No folder selected";
  if (value.startsWith("http")) return "Manual folder link";
  return value;
}

export default function DataInputPage() {
  const router = useRouter();
  const {
    uploadFiles,
    importGoogleDriveFolder,
    uploading,
    uploadError,
    uploadProgress,
    sessionId,
    gaps,
    followUpQuestions,
    confidence,
    driveFolder,
  } = useNexusStore();

  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [dragging, setDragging] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [driveDialogOpen, setDriveDialogOpen] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState("");
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveAuthPending, setDriveAuthPending] = useState(false);
  const [driveFolders, setDriveFolders] = useState<DriveFolderNode[]>([]);
  const [driveFolderPath, setDriveFolderPath] = useState<DriveFolderNode[]>([
    { id: "root", name: "My Drive" },
  ]);
  const [driveFolderBrowserLoading, setDriveFolderBrowserLoading] =
    useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const driveDialogRef = useRef<HTMLDivElement>(null);
  const driveFolderInputRef = useRef<HTMLInputElement>(null);
  const driveTokenClientRef = useRef<GoogleTokenClient | null>(null);
  const driveAccessTokenRef = useRef<string | null>(null);
  const isDriveImporting = driveDialogOpen && uploading;
  const selectedDriveFolder =
    driveFolders.find((folder) => folder.id === driveFolderId) ??
    driveFolderPath.find((folder) => folder.id === driveFolderId) ??
    null;

  useEffect(() => {
    if (!sessionId) return;
    router.push(`/network/${sessionId}` as Route);
  }, [router, sessionId]);

  useEffect(() => {
    if (!driveDialogOpen) return;

    driveDialogRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    window.setTimeout(() => {
      driveFolderInputRef.current?.focus();
    }, 120);
  }, [driveDialogOpen]);

  const loadDriveFolders = useCallback(
    async (parent: DriveFolderNode, nextPath?: DriveFolderNode[]) => {
      if (!driveAccessTokenRef.current) {
        throw new Error("Authorize Google Drive before browsing folders.");
      }

      setDriveFolderBrowserLoading(true);
      setDriveError(null);

      try {
        const params = new URLSearchParams({
          q:
            parent.id === "root"
              ? `mimeType='${DRIVE_FOLDER_MIME_TYPE}' and 'root' in parents and trashed=false`
              : `mimeType='${DRIVE_FOLDER_MIME_TYPE}' and '${parent.id}' in parents and trashed=false`,
          fields: "files(id,name)",
          orderBy: "name_natural",
          pageSize: "200",
          supportsAllDrives: "true",
          includeItemsFromAllDrives: "true",
        });

        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${driveAccessTokenRef.current}`,
              Accept: "application/json",
            },
          },
        );

        const payload = (await response.json()) as {
          error?: { message?: string };
          files?: Array<{ id?: string; name?: string }>;
        };

        if (!response.ok) {
          throw new Error(
            payload.error?.message || "Failed to load Google Drive folders.",
          );
        }

        const folders = (payload.files ?? [])
          .filter((folder) => folder.id && folder.name)
          .map((folder) => ({
            id: folder.id as string,
            name: folder.name as string,
          }));

        setDriveFolders(folders);
        if (nextPath) {
          setDriveFolderPath(nextPath);
        }
        return true;
      } catch (error) {
        setDriveFolders([]);
        setDriveError(
          error instanceof Error
            ? error.message
            : "Failed to load Google Drive folders.",
        );
        return false;
      } finally {
        setDriveFolderBrowserLoading(false);
      }
    },
    [],
  );

  const loadGoogleIdentity = useCallback(async (): Promise<void> => {
    if (typeof window === "undefined") {
      throw new Error("Google Drive auth is only available in the browser.");
    }

    const googleWindow = window as GoogleWindow;
    if (googleWindow.google?.accounts?.oauth2) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-google-identity="true"]',
      );

      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Failed to load Google Identity Services.")),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load Google Identity Services."));
      document.head.appendChild(script);
    });
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter((f) => {
      const ext = `.${fileExtension(f.name)}`;
      return ACCEPT_TYPES.includes(ext);
    });
    setFiles((prev) => {
      const existing = new Set(prev.map((file) => file.name + file.size));
      const deduped = arr.filter(
        (file) => !existing.has(file.name + file.size),
      );
      return [...prev, ...deduped];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      if (e.dataTransfer.files.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleBuild = async () => {
    if (files.length === 0) return;
    await uploadFiles(files, description || undefined);
  };

  const handleProceed = () => {
    setShowFollowUp(false);
    if (sessionId) {
      router.push(`/network/${sessionId}` as Route);
    }
  };

  const handleConnectGoogleDrive = useCallback(async () => {
    setDriveError(null);

    if (!GOOGLE_CLIENT_ID) {
      setDriveError(
        "Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID. Configure Google OAuth before enabling Drive import.",
      );
      return;
    }

    try {
      setDriveAuthPending(true);
      await loadGoogleIdentity();
      const googleWindow = window as GoogleWindow;
      const accounts = googleWindow.google?.accounts;
      if (!accounts?.oauth2) {
        throw new Error("Google Identity Services did not initialize.");
      }

      const accessToken = await new Promise<string>((resolve, reject) => {
        driveTokenClientRef.current = accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: GOOGLE_SCOPE,
          callback: (response) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }
            if (!response.access_token) {
              reject(new Error("Google Drive access token was not returned."));
              return;
            }
            resolve(response.access_token);
          },
          error_callback: (error) => {
            reject(
              new Error(
                error.message ||
                  error.type ||
                  "Google Drive authorization did not complete.",
              ),
            );
          },
        });

        driveTokenClientRef.current.requestAccessToken({ prompt: "consent" });
      });

      driveAccessTokenRef.current = accessToken;
      setDriveFolderId("");
      setDriveFolderPath([{ id: "root", name: "My Drive" }]);
      const loaded = await loadDriveFolders({ id: "root", name: "My Drive" }, [
        { id: "root", name: "My Drive" },
      ]);
      if (!loaded) {
        return;
      }
      setDriveDialogOpen(true);
    } catch (error) {
      setDriveError(
        error instanceof Error ? error.message : "Google Drive auth failed.",
      );
      setDriveFolders([]);
    } finally {
      setDriveAuthPending(false);
    }
  }, [loadDriveFolders, loadGoogleIdentity]);

  const handleOpenDriveFolder = useCallback(
    async (folder: DriveFolderNode) => {
      const nextPath = [...driveFolderPath, folder];
      const loaded = await loadDriveFolders(folder, nextPath);
      if (loaded) {
        setDriveFolderId(folder.id);
      }
    },
    [driveFolderPath, loadDriveFolders],
  );

  const handleJumpToDrivePath = useCallback(
    async (index: number) => {
      const nextPath = driveFolderPath.slice(0, index + 1);
      const target = nextPath.at(-1);
      if (!target) return;

      const loaded = await loadDriveFolders(target, nextPath);
      if (loaded) {
        setDriveFolderId(target.id === "root" ? "" : target.id);
      }
    },
    [driveFolderPath, loadDriveFolders],
  );

  const handleImportGoogleDrive = useCallback(async () => {
    if (!driveAccessTokenRef.current) {
      setDriveError("Authorize Google Drive before importing a folder.");
      return;
    }

    if (!driveFolderId.trim()) {
      setDriveError("Paste a Google Drive folder link or folder id.");
      return;
    }

    setDriveError(null);
    const imported = await importGoogleDriveFolder(
      driveAccessTokenRef.current,
      driveFolderId.trim(),
      description || undefined,
    );
    if (imported) {
      setDriveDialogOpen(false);
      return;
    }

    setDriveError(
      useNexusStore.getState().uploadError ||
        "Google Drive import failed. Check the folder id and your access.",
    );
  }, [description, driveFolderId, importGoogleDriveFolder]);

  return (
    <main className="app-shell min-h-screen px-6 py-8 md:px-12 md:py-16">
      <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-12 lg:gap-24">
        <header className="fade-rise flex flex-col items-start gap-12 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <span className="mono-label rounded-full border border-white/10 bg-white/5 px-3 py-1">
                RESILIENCE CONSOLE v1.0
              </span>
              <span className="status-dot animate-pulse" />
              <span className="mono-label text-[var(--accent-soft)]">
                OPERATIONAL STATUS: READY
              </span>
            </div>
            <h1 className="display-face text-[clamp(2.5rem,8vw,5.5rem)] font-bold leading-[0.92] tracking-[-0.05em] text-[var(--foreground)]">
              Discover the dependencies that{" "}
              <span className="text-[var(--danger)]">break</span> the
              organization.
            </h1>
          </div>

          <div className="flex flex-col gap-4 text-left lg:max-w-xs lg:text-right">
            <div className="eyebrow">Strategic Resilience Console</div>
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              Deterministic stress-testing for complex human and technical
              systems. Map, analyze, and preempt catastrophic failure paths.
            </p>
          </div>
        </header>

        <section className="grid gap-16 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
          <div className="fade-rise-delay flex flex-col gap-12">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE_STEPS.map((step) => (
                <div
                  key={step.id}
                  className="bracket-box flex flex-col gap-3 rounded-xl border-white/5 bg-white/[0.02] p-5"
                >
                  <div className="flex items-center justify-between">
                    <span className="mono-label text-[var(--accent-soft)]">
                      STAGE_{step.id}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  </div>
                  <div className="text-lg font-bold tracking-tight text-[var(--foreground)] uppercase">
                    {step.title}
                  </div>
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    {step.detail}
                  </p>
                </div>
              ))}
            </div>

            <section className="control-surface-strong relative overflow-hidden rounded-[40px] p-8 sm:p-12">
              <div className="absolute top-0 right-0 h-48 w-48 opacity-10 pointer-events-none">
                <svg viewBox="0 0 100 100" fill="none" stroke="currentColor">
                  <circle cx="100" cy="0" r="80" strokeWidth="0.5" />
                  <circle cx="100" cy="0" r="60" strokeWidth="0.5" />
                  <circle cx="100" cy="0" r="40" strokeWidth="0.5" />
                </svg>
              </div>

              <div className="flex flex-col gap-10">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-1 w-8 bg-[var(--accent)]" />
                    <div className="eyebrow">DATA INTAKE MODULE</div>
                  </div>
                  <h2 className="display-face text-[clamp(2rem,5vw,3.5rem)] font-medium tracking-[-0.04em] text-[var(--foreground)]">
                    Initialize organizational footprint.
                  </h2>
                  <p className="max-w-2xl text-base leading-relaxed text-[var(--muted)]">
                    Start with your core roster or drop the full operational
                    stack. We will extract entities, map dependencies, and stage
                    the graph for adversarial simulation.
                  </p>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => inputRef.current?.click()}
                  className={`rounded-[32px] border border-dashed p-8 transition-all sm:p-12 ${
                    dragging
                      ? "border-[var(--accent)] bg-[color:rgb(123_220_198_/_0.12)]"
                      : "border-white/10 bg-white/[0.04] hover:border-[var(--accent-soft)] hover:bg-white/[0.06]"
                  }`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                >
                  <div className="flex flex-col items-center justify-center gap-6 text-center">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                      <div className="absolute inset-[-1px] rounded-2xl border border-white/10 pointer-events-none" />
                      <svg
                        className="h-8 w-8 text-[var(--accent-soft)]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="display-face text-3xl font-medium tracking-tight text-[var(--foreground)]">
                        {dragging ? "RELEASE TO STAGE" : "DROP SOURCE FILES"}
                      </p>
                      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                        CSV, PDF, DOCX, XLSX, JSON, IMAGE.
                        <br />
                        Combine multiple files for 10x graph resolution.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="accent-button mt-4 rounded-full px-8 py-4 text-xs font-bold uppercase tracking-[0.2em]"
                    >
                      SELECT SOURCE
                    </button>
                  </div>

                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACCEPT_STRING}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files);
                    }}
                  />
                </div>

                {files.length > 0 && (
                  <div className="grid gap-6">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <p className="mono-label">
                        STAGED PAYLOAD: {files.length} ENTITY
                        {files.length === 1 ? "" : "IES"}
                      </p>
                    </div>
                    <ul className="custom-scrollbar grid gap-3 overflow-y-auto max-h-[320px] pr-2">
                      {files.map((file, index) => {
                        const ext = fileExtension(file.name);
                        return (
                          <li
                            key={`${file.name}-${file.size}`}
                            className="group flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:bg-white/[0.04]"
                          >
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[10px] font-bold uppercase tracking-widest ${badgeClass(ext)}`}
                            >
                              {ext || "FILE"}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-sm font-medium text-[var(--foreground)]">
                                {file.name}
                              </span>
                              <span className="mono-label text-[10px] opacity-60">
                                SIZE: {formatSize(file.size)}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="mono-label text-[10px] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(index);
                              }}
                            >
                              [ REMOVE ]
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                  <div className="flex flex-col gap-4">
                    <label className="flex flex-col gap-2">
                      <span className="mono-label">
                        Narrative Context (Optional)
                      </span>
                      <div className="field-shell rounded-3xl p-5">
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={4}
                          placeholder="Example: 24-person SaaS company with a centralized platform team, revenue concentrated in enterprise sales, and a single office and AWS footprint."
                          className="w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-[var(--foreground)] outline-none placeholder:text-white/20"
                        />
                      </div>
                    </label>
                  </div>

                  <div className="flex flex-col gap-4 lg:min-w-[280px]">
                    <button
                      type="button"
                      className="ghost-button rounded-full py-5 text-xs font-bold uppercase tracking-[0.2em] disabled:opacity-20"
                      onClick={handleConnectGoogleDrive}
                      disabled={uploading || driveAuthPending}
                    >
                      {driveAuthPending
                        ? "AUTHORIZING..."
                        : "CONNECT GOOGLE DRIVE"}
                    </button>
                    <button
                      type="button"
                      className="accent-button rounded-full py-5 text-xs font-bold uppercase tracking-[0.2em] disabled:opacity-20"
                      onClick={handleBuild}
                      disabled={files.length === 0 || uploading}
                    >
                      {uploading ? "CALCULATING..." : "BUILD NETWORK →"}
                    </button>
                  </div>
                </div>

                {driveFolder && (
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-[var(--foreground)]">
                    Imported Drive folder{" "}
                    <span className="font-semibold">{driveFolder.name}</span>{" "}
                    with {driveFolder.file_count} files
                    {driveFolder.files_skipped > 0
                      ? ` (${driveFolder.files_skipped} skipped)`
                      : ""}
                    .
                  </div>
                )}

                {driveError && (
                  <div className="rounded-[24px] border border-[color:rgb(212_107_70_/_0.3)] bg-[color:rgb(212_107_70_/_0.08)] px-5 py-4 text-sm text-[color:rgb(255_202_186)]">
                    {driveError}
                  </div>
                )}

                {uploadError && (
                  <div className="rounded-[24px] border border-[color:rgb(212_107_70_/_0.3)] bg-[color:rgb(212_107_70_/_0.08)] px-5 py-4 text-sm text-[color:rgb(255_202_186)]">
                    {uploadError}
                  </div>
                )}

                {uploading && (
                  <div className="rounded-[24px] border border-[color:rgb(123_220_198_/_0.22)] bg-[color:rgb(123_220_198_/_0.06)] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative h-4 w-4">
                        <span className="absolute inset-0 rounded-full border border-[color:rgb(123_220_198_/_0.28)]" />
                        <span className="absolute inset-[3px] rounded-full bg-[var(--accent-soft)] signal-pulse" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">
                          {uploadProgress}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Extracting entities, linking dependencies, and staging
                          the first graph state.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {driveDialogOpen && (
              <section className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-md sm:px-6">
                <div
                  ref={driveDialogRef}
                  className="control-surface-strong relative w-full max-w-5xl overflow-hidden rounded-[48px] p-8 shadow-[0_32px_120px_rgba(0,0,0,0.6)] sm:p-12"
                >
                  <div className="mb-12 flex items-start justify-between gap-6">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-1 w-8 bg-[var(--accent)]" />
                        <div className="eyebrow">DRIVE_ACCESS_PROTOCOL</div>
                      </div>
                      <h3 className="display-face text-[clamp(2rem,4vw,3rem)] font-medium tracking-[-0.03em] text-[var(--foreground)]">
                        Select target directory.
                      </h3>
                      <p className="max-w-2xl text-base leading-relaxed text-[var(--muted)]">
                        Browse your Google Drive folders below. Selecting a root
                        folder with high connectivity will improve the final
                        graph resolution.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mono-label rounded-full border border-white/10 px-5 py-2 transition-colors hover:bg-white/5"
                      onClick={() => setDriveDialogOpen(false)}
                      disabled={isDriveImporting}
                    >
                      [ CLOSE ]
                    </button>
                  </div>

                  <div className="grid gap-8 lg:grid-cols-[1fr_280px] lg:items-end">
                    <label className="flex flex-col gap-2">
                      <span className="mono-label text-[10px]">
                        SELECTED_RESOURCE_ID
                      </span>
                      <div className="field-shell rounded-3xl p-5">
                        <input
                          ref={driveFolderInputRef}
                          value={driveFolderId}
                          onChange={(e) => setDriveFolderId(e.target.value)}
                          placeholder="FOLDER_ID_OR_URL"
                          className="w-full border-0 bg-transparent font-mono text-sm leading-6 text-[var(--foreground)] outline-none placeholder:text-white/10"
                        />
                      </div>
                    </label>

                    <div className="flex flex-col gap-4">
                      <button
                        type="button"
                        className="accent-button rounded-full py-5 text-xs font-bold uppercase tracking-[0.2em] disabled:opacity-20"
                        onClick={handleImportGoogleDrive}
                        disabled={uploading || driveFolderBrowserLoading}
                      >
                        {isDriveImporting
                          ? "IMPORTING..."
                          : "IMPORT DIRECTORY →"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-12 grid gap-6 md:grid-cols-2">
                    <div className="bracket-box rounded-3xl border-white/5 bg-white/[0.02]">
                      <div className="mb-4 mono-label text-[10px]">
                        ACTIVE_SELECTION
                      </div>
                      <div className="text-xl font-bold text-[var(--foreground)]">
                        {selectedDriveFolder?.name ||
                          displayDriveFolderLabel(driveFolderId)}
                      </div>
                      <div className="mt-3 font-mono text-[10px] opacity-40">
                        {selectedDriveFolder
                          ? `UID: ${selectedDriveFolder.id}`
                          : driveFolderId
                            ? "MANUAL_REFERENCE_DETECTED"
                            : "AWAITING_SELECTION..."}
                      </div>
                    </div>

                    <div className="bracket-box rounded-3xl border-white/5 bg-[var(--accent)]/[0.03]">
                      <div className="mb-4 mono-label text-[10px] text-[var(--accent-soft)]">
                        IMPORT_SEQUENCE
                      </div>
                      <div className="space-y-3 font-mono text-[11px]">
                        <div
                          className={
                            driveAuthPending
                              ? "text-[var(--accent)]"
                              : "text-white/40"
                          }
                        >
                          01_AUTHORIZE_PROTOCOL
                        </div>
                        <div
                          className={
                            driveDialogOpen
                              ? "text-[var(--accent)]"
                              : "text-white/40"
                          }
                        >
                          02_RESOLVE_HIERARCHY
                        </div>
                        <div
                          className={
                            isDriveImporting
                              ? "text-[var(--accent)]"
                              : "text-white/40"
                          }
                        >
                          03_INGEST_PAYLOAD
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-col gap-6 rounded-[32px] border border-white/5 bg-white/[0.01] p-6 sm:p-8">
                    <div className="flex flex-wrap items-center gap-3">
                      {driveFolderPath.map((folder, index) => (
                        <div
                          key={`${folder.id}-${index}`}
                          className="flex items-center gap-3"
                        >
                          <button
                            type="button"
                            className="mono-label text-[10px] transition-colors hover:text-[var(--accent-soft)] disabled:opacity-20"
                            onClick={() => void handleJumpToDrivePath(index)}
                            disabled={driveFolderBrowserLoading}
                          >
                            {folder.name.toUpperCase()}
                          </button>
                          {index < driveFolderPath.length - 1 && (
                            <span className="text-white/10">/</span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="mono-label text-[10px]">
                          DIRECTORY_BROWSER
                        </div>
                      </div>
                      <button
                        type="button"
                        className="mono-label rounded-full border border-white/10 px-4 py-2 text-[9px] hover:bg-white/5 disabled:opacity-20"
                        onClick={() =>
                          void loadDriveFolders(
                            driveFolderPath[driveFolderPath.length - 1] ?? {
                              id: "root",
                              name: "My Drive",
                            },
                            driveFolderPath,
                          )
                        }
                        disabled={driveFolderBrowserLoading || isDriveImporting}
                      >
                        {driveFolderBrowserLoading
                          ? "REFRESHING..."
                          : "FORCE_REFRESH"}
                      </button>
                    </div>

                    <div className="grid gap-2">
                      {driveFolderBrowserLoading ? (
                        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-12 text-center">
                          <span className="mono-label text-[10px] animate-pulse">
                            SYNCHRONIZING_DIRECTORY_TREE...
                          </span>
                        </div>
                      ) : driveFolders.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {driveFolders.map((folder) => (
                            <div
                              key={folder.id}
                              className="group flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:bg-white/[0.04]"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-bold text-[var(--foreground)] uppercase tracking-tight">
                                  {folder.name}
                                </div>
                                <div className="truncate font-mono text-[9px] opacity-30">
                                  {folder.id}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="mono-label rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 text-[9px] transition-colors hover:bg-white/10"
                                  onClick={() => setDriveFolderId(folder.id)}
                                  disabled={isDriveImporting}
                                >
                                  SELECT
                                </button>
                                <button
                                  type="button"
                                  className="mono-label rounded-lg border border-white/5 px-3 py-1.5 text-[9px] transition-colors hover:bg-white/10"
                                  onClick={() =>
                                    void handleOpenDriveFolder(folder)
                                  }
                                  disabled={isDriveImporting}
                                >
                                  OPEN
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-12 text-center">
                          <span className="mono-label text-[10px] opacity-40">
                            NO_SUBDIRECTORIES_DETECTED
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {(driveError || uploadError) && (
                    <div className="mt-4 rounded-[24px] border border-[color:rgb(212_107_70_/_0.3)] bg-[color:rgb(212_107_70_/_0.08)] px-5 py-4 text-sm text-[color:rgb(255_202_186)]">
                      {driveError || uploadError}
                    </div>
                  )}

                  {isDriveImporting && (
                    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 p-8 backdrop-blur-xl">
                      <div className="control-surface-strong w-full max-w-lg rounded-[40px] p-10 shadow-[0_32px_90px_rgba(0,0,0,0.5)]">
                        <div className="mb-8 flex items-center gap-6">
                          <div className="relative h-16 w-16">
                            <span className="absolute inset-0 rounded-full border border-white/5 animate-ping" />
                            <span className="absolute inset-[14px] rounded-full bg-[var(--accent)] animate-pulse" />
                            <span className="drive-import-spinner absolute inset-[2px] rounded-full border-2 border-transparent border-t-[var(--accent)]" />
                          </div>
                          <div>
                            <div className="mono-label text-[var(--accent-soft)]">
                              INGESTION_IN_PROGRESS
                            </div>
                            <div className="display-face text-2xl font-bold text-[var(--foreground)]">
                              {uploadProgress || "Mapping tree"}
                            </div>
                          </div>
                        </div>

                        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div className="drive-progress-bar h-full w-full" />
                        </div>

                        <div className="rounded-2xl border border-white/5 bg-black/20 p-4 font-mono text-[10px] text-[var(--muted-strong)]">
                          TARGET: {selectedDriveFolder?.name || "REMOTE_SOURCE"}
                        </div>

                        <p className="mt-6 text-sm leading-relaxed text-[var(--muted)]">
                          Scanning the directory tree, identifying supported
                          entities, and establishing baseline dependency
                          weights. Larger environments may require extended
                          compute.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {showFollowUp && (
              <section className="control-surface-strong rounded-[40px] p-8 sm:p-12">
                <div className="mb-10 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-1 w-8 bg-[var(--accent)]" />
                    <div className="eyebrow">GRAPH_VALIDATION_PROTOCOL</div>
                  </div>
                  <div className="flex items-start justify-between gap-6">
                    <h3 className="display-face text-[clamp(2rem,4vw,3rem)] font-medium tracking-[-0.03em] text-[var(--foreground)]">
                      Coverage gaps detected.
                    </h3>
                    <div className="bracket-box rounded-2xl py-3 px-5">
                      <div className="mono-label text-[9px] mb-1 opacity-50">
                        CONFIDENCE_SCORE
                      </div>
                      <div className="text-xl font-bold text-[var(--accent)]">
                        {Math.round((confidence ?? 0) * 100)}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-12 lg:grid-cols-[1fr_240px] lg:items-end">
                  <div className="grid gap-10 md:grid-cols-2">
                    <div className="flex flex-col gap-4">
                      <p className="mono-label text-[10px] text-[var(--accent-soft)]">
                        PENDING_CLARIFICATIONS
                      </p>
                      <ul className="flex flex-col gap-3">
                        {followUpQuestions.map((question, index) => (
                          <li
                            key={question}
                            className="flex gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm leading-relaxed text-[var(--foreground)]"
                          >
                            <span className="font-mono text-[10px] text-[var(--accent-soft)] opacity-40">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span>{question}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {gaps.length > 0 && (
                      <div className="flex flex-col gap-4">
                        <p className="mono-label text-[10px] text-[var(--warn)]">
                          OBSERVED_TOPOLOGY_GAPS
                        </p>
                        <ul className="flex flex-col gap-3">
                          {gaps.map((gap) => (
                            <li
                              key={gap}
                              className="rounded-2xl border border-[var(--warn)]/10 bg-[var(--warn)]/5 p-4 text-sm leading-relaxed text-[var(--warn)]"
                            >
                              {gap}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="accent-button rounded-full py-6 text-xs font-bold uppercase tracking-[0.2em]"
                    onClick={handleProceed}
                  >
                    CONTINUE →
                  </button>
                </div>
              </section>
            )}
          </div>

          <aside className="fade-rise flex flex-col gap-10 lg:sticky lg:top-24">
            <section className="control-surface-strong relative flex flex-col gap-8 overflow-hidden rounded-[48px] p-8 sm:p-10">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                  <div className="eyebrow">LIVE DEPENDENCY MONITOR</div>
                </div>
                <h2 className="display-face text-[clamp(2rem,4vw,3.2rem)] font-medium tracking-[-0.05em] text-[var(--foreground)]">
                  Topology Preview
                </h2>
              </div>

              <div className="relative overflow-hidden rounded-[32px] border border-white/5 bg-black/40 p-6">
                <div className="absolute top-4 left-6 flex flex-col gap-1">
                  <div className="mono-label text-[9px] opacity-40">
                    SYSTEM_CLOCK: 172948.04
                  </div>
                  <div className="mono-label text-[9px] opacity-40">
                    RESOLUTION: 1080P_SCAN
                  </div>
                </div>

                <svg
                  viewBox="0 0 400 280"
                  className="h-auto w-full filter drop-shadow-[0_0_12px_rgba(123,220,198,0.15)]"
                >
                  <defs>
                    <linearGradient id="edgeGlow" x1="0%" x2="100%">
                      <stop
                        offset="0%"
                        stopColor="var(--accent-soft)"
                        stopOpacity="0.1"
                      />
                      <stop
                        offset="50%"
                        stopColor="var(--accent)"
                        stopOpacity="0.4"
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--accent-soft)"
                        stopOpacity="0.1"
                      />
                    </linearGradient>
                  </defs>

                  {PREVIEW_EDGES.map((edge) => {
                    const from = PREVIEW_NODES[edge.from];
                    const to = PREVIEW_NODES[edge.to];
                    return (
                      <g key={`${edge.from}-${edge.to}`}>
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke="white"
                          strokeOpacity="0.05"
                          strokeWidth="1"
                        />
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke="url(#edgeGlow)"
                          strokeWidth="1.5"
                          strokeDasharray="4 16"
                          className="signal-track"
                        />
                      </g>
                    );
                  })}

                  {PREVIEW_NODES.map((node, index) => (
                    <g
                      key={node.name}
                      transform={`translate(${node.x}, ${node.y})`}
                    >
                      <circle
                        r={node.size + 14}
                        fill={node.color}
                        opacity="0.08"
                        className={index === 0 ? "animate-pulse" : ""}
                      />
                      <circle
                        r={node.size}
                        fill="black"
                        stroke={node.color}
                        strokeWidth="1.5"
                        strokeOpacity="0.6"
                      />
                      <circle r={2} fill={node.color} />
                      <text
                        y={node.size + 18}
                        textAnchor="middle"
                        fill="var(--foreground)"
                        fontSize="10"
                        fontWeight="600"
                        className="mono-label !text-[10px] tracking-widest opacity-80"
                      >
                        {node.name.toUpperCase()}
                      </text>
                    </g>
                  ))}
                </svg>

                <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/5 pt-6">
                  <PreviewMetric
                    label="ENTITY_COUNT"
                    value="14_NODES"
                    accent="var(--layer-people)"
                  />
                  <PreviewMetric
                    label="CRITICAL_PATH"
                    value="03_HOPS"
                    accent="var(--danger)"
                  />
                  <PreviewMetric
                    label="HEALTH_IDX"
                    value="1.00_H"
                    accent="var(--healthy)"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="eyebrow">SYSTEM LOG</div>
                <div className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-4 font-mono text-[10px] leading-relaxed text-[var(--muted)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--accent-soft)]">[INFO]</span>
                    <span>ADVERSARIAL_ENGINE_INIT: OK</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--accent-soft)]">[INFO]</span>
                    <span>TOPOLOGY_SCAN_ACTIVE: WAITING_FOR_PAYLOAD</span>
                  </div>
                  <div className="flex items-center gap-2 opacity-40">
                    <span className="text-[var(--warn)]">[WARN]</span>
                    <span>DETERMINISTIC_MODE: ENABLED</span>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function PreviewMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="mono-label !text-[9px] opacity-50">{label}</div>
      <div
        className="display-face text-sm font-bold tracking-tight"
        style={{ color: accent }}
      >
        {value}
      </div>
    </div>
  );
}
