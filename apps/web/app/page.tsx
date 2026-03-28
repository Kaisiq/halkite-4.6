"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNexusStore } from "@/lib/store";

/* ------------------------------------------------------------------ */
/*  Accepted file types                                                */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

const TYPE_COLORS: Record<string, string> = {
  pdf: "bg-red-500/20 text-red-300 border-red-500/30",
  docx: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  xlsx: "bg-green-500/20 text-green-300 border-green-500/30",
  csv: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  tsv: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  png: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  jpg: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  json: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  xml: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  txt: "bg-gray-400/20 text-gray-300 border-gray-400/30",
  md: "bg-gray-400/20 text-gray-300 border-gray-400/30",
};

function badgeClass(ext: string): string {
  return TYPE_COLORS[ext] ?? "bg-gray-400/20 text-gray-300 border-gray-400/30";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */
export default function DataInputPage() {
  const router = useRouter();

  const {
    uploadFiles,
    uploading,
    uploadError,
    uploadProgress,
    sessionId,
    gaps,
    followUpQuestions,
    confidence,
  } = useNexusStore();

  /* Local state */
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [dragging, setDragging] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* When session comes back, either show follow-up or redirect */
  useEffect(() => {
    if (!sessionId) return;
    if (followUpQuestions.length > 0) {
      setShowFollowUp(true);
    } else {
      router.push(`/network/${sessionId}`);
    }
  }, [sessionId, followUpQuestions, router]);

  /* ---- File handling ---- */
  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter((f) => {
      const ext = `.${fileExtension(f.name)}`;
      return ACCEPT_TYPES.includes(ext);
    });
    setFiles((prev) => {
      const existing = new Set(prev.map((p) => p.name + p.size));
      const deduped = arr.filter((f) => !existing.has(f.name + f.size));
      return [...prev, ...deduped];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /* ---- Drag & drop ---- */
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

  /* ---- Submit ---- */
  const handleBuild = async () => {
    if (files.length === 0) return;
    await uploadFiles(files, description || undefined);
  };

  /* ---- Dismiss follow-up and navigate ---- */
  const handleProceed = () => {
    setShowFollowUp(false);
    if (sessionId) router.push(`/network/${sessionId}`);
  };

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */
  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-12 sm:py-16">
      {/* ---------- Branding ---------- */}
      <header className="text-center mb-10 sm:mb-14">
        <p className="text-[var(--accent)] uppercase tracking-[0.22em] text-xs font-bold mb-3">
          Network Survival Analyzer
        </p>
        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-white via-[var(--foreground)] to-[var(--accent)] bg-clip-text text-transparent">
          NEXUS
        </h1>
        <p className="mt-3 text-[var(--muted)] text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
          Upload your organization data and we will map every dependency,
          pinpoint hidden weakpoints, and simulate worst-case cascades.
        </p>
      </header>

      {/* ---------- Main card ---------- */}
      <section className="w-full max-w-[780px]">
        <div className="rounded-2xl border border-white/[0.08] bg-[var(--panel)] backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.35)] p-6 sm:p-8 space-y-6">
          {/* ---- Drop zone ---- */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`
              relative group cursor-pointer rounded-xl border-2 border-dashed
              transition-all duration-200 p-8 sm:p-12 text-center
              ${
                dragging
                  ? "border-[var(--accent)] bg-[var(--accent)]/[0.06] scale-[1.01]"
                  : "border-white/[0.12] hover:border-[var(--accent)]/60 hover:bg-white/[0.02]"
              }
            `}
          >
            {/* upload icon */}
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[var(--accent)]/[0.1] flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
              <svg
                className="w-7 h-7 text-[var(--accent)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                />
              </svg>
            </div>

            <p className="text-[var(--foreground)] font-semibold text-lg mb-1">
              {dragging ? "Drop files here" : "Drag & drop your files here"}
            </p>
            <p className="text-[var(--muted)] text-sm">
              or{" "}
              <span className="text-[var(--accent)] underline underline-offset-2">
                click to browse
              </span>
            </p>
            <p className="text-[var(--muted)]/60 text-xs mt-3">
              PDF, DOCX, XLSX, CSV, TSV, PNG, JPG, JSON, XML, TXT, MD
            </p>

            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_STRING}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {/* ---- File list ---- */}
          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-[var(--muted)] font-semibold">
                Files ({files.length})
              </p>
              <ul className="space-y-1.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                {files.map((file, i) => {
                  const ext = fileExtension(file.name);
                  return (
                    <li
                      key={`${file.name}-${file.size}-${i}`}
                      className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3.5 py-2.5 group/item"
                    >
                      {/* type badge */}
                      <span
                        className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${badgeClass(ext)}`}
                      >
                        {ext || "?"}
                      </span>
                      {/* name */}
                      <span className="flex-1 truncate text-sm text-[var(--foreground)]/90">
                        {file.name}
                      </span>
                      {/* size */}
                      <span className="shrink-0 text-xs text-[var(--muted)]/70 tabular-nums">
                        {formatSize(file.size)}
                      </span>
                      {/* remove */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity text-[var(--muted)] hover:text-red-400 p-0.5"
                        aria-label={`Remove ${file.name}`}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* ---- Description textarea ---- */}
          <div className="space-y-2">
            <label
              htmlFor="org-desc"
              className="text-xs uppercase tracking-wider text-[var(--muted)] font-semibold"
            >
              Describe your organization{" "}
              <span className="normal-case tracking-normal font-normal opacity-60">
                (optional)
              </span>
            </label>
            <textarea
              id="org-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g. A mid-size bakery chain with 4 locations, 35 employees, and a central commissary kitchen..."
              className="w-full rounded-lg bg-white/[0.04] border border-white/[0.1] text-[var(--foreground)] placeholder:text-[var(--muted)]/40 text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]/50 transition-all resize-y"
            />
          </div>

          {/* ---- Error ---- */}
          {uploadError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-400 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-red-300">{uploadError}</p>
            </div>
          )}

          {/* ---- Loading state ---- */}
          {uploading && (
            <div className="rounded-lg bg-[var(--accent)]/[0.06] border border-[var(--accent)]/20 px-4 py-4 flex items-center gap-4">
              {/* spinner */}
              <div className="relative w-6 h-6 shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-[var(--accent)]/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--accent)] animate-spin" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--accent)]">
                  {uploadProgress}
                </p>
                <p className="text-xs text-[var(--muted)]/60 mt-0.5">
                  This may take a moment depending on file size
                </p>
              </div>
            </div>
          )}

          {/* ---- Build button ---- */}
          {!uploading && !showFollowUp && (
            <button
              type="button"
              disabled={files.length === 0}
              onClick={handleBuild}
              className={`
                w-full rounded-xl py-3.5 text-sm font-bold uppercase tracking-wider
                transition-all duration-200
                ${
                  files.length === 0
                    ? "bg-white/[0.06] text-[var(--muted)]/40 cursor-not-allowed border border-white/[0.06]"
                    : "bg-[var(--accent)] text-[#08111f] hover:brightness-110 hover:shadow-[0_0_30px_rgba(110,231,200,0.25)] active:scale-[0.98] border border-[var(--accent)]"
                }
              `}
            >
              Build Network
              {files.length > 0 && (
                <span className="ml-2 opacity-70">
                  ({files.length} file{files.length > 1 ? "s" : ""})
                </span>
              )}
            </button>
          )}
        </div>

        {/* ---------- Follow-up questions panel ---------- */}
        {showFollowUp && followUpQuestions.length > 0 && (
          <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-500/[0.05] backdrop-blur-xl p-6 sm:p-8 space-y-4 animate-in">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="text-sm font-semibold text-yellow-300">
                  We have some follow-up questions
                </p>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  These could help improve the accuracy of your network model.
                </p>
              </div>
            </div>

            <ul className="space-y-2">
              {followUpQuestions.map((q, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm text-[var(--foreground)]/90"
                >
                  <span className="shrink-0 w-5 h-5 rounded-full bg-yellow-400/10 text-yellow-400 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  {q}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={handleProceed}
              className="w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wider bg-[var(--accent)] text-[#08111f] hover:brightness-110 hover:shadow-[0_0_30px_rgba(110,231,200,0.25)] active:scale-[0.98] transition-all duration-200"
            >
              Continue to Network View
            </button>
          </div>
        )}

        {/* ---------- Gaps & confidence ---------- */}
        {sessionId && confidence !== null && !showFollowUp && (
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[var(--panel)] backdrop-blur-xl p-6 space-y-4">
            {/* Confidence bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="uppercase tracking-wider text-[var(--muted)] font-semibold">
                  Model confidence
                </span>
                <span className="font-mono text-[var(--accent)] font-bold">
                  {Math.round(confidence * 100)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--accent)]/80 to-[var(--accent)] transition-all duration-700"
                  style={{ width: `${confidence * 100}%` }}
                />
              </div>
            </div>

            {/* Gaps */}
            {gaps.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-[var(--muted)] font-semibold">
                  Data gaps detected
                </p>
                <ul className="space-y-1.5">
                  {gaps.map((gap, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-[var(--muted)]"
                    >
                      <span className="shrink-0 text-yellow-400 mt-0.5">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </span>
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Footer hint */}
      <p className="mt-12 text-center text-xs text-[var(--muted)]/40">
        Your data never leaves the session. Analysis is deterministic and fully auditable.
      </p>
    </main>
  );
}
