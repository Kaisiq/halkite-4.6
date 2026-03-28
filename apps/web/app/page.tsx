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
  { name: "CEO", x: 108, y: 68, size: 22, color: "var(--accent-soft)" },
  { name: "CTO", x: 196, y: 118, size: 16, color: "#85aef0" },
  { name: "COO", x: 122, y: 180, size: 15, color: "#f0b663" },
  { name: "Platform", x: 268, y: 86, size: 14, color: "#78d7c7" },
  { name: "Sales", x: 252, y: 196, size: 13, color: "#de8d63" },
  { name: "Finance", x: 332, y: 148, size: 12, color: "#d7d36a" },
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

  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [dragging, setDragging] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    router.push(`/network/${sessionId}` as Route);
  }, [router, sessionId]);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter((f) => {
      const ext = `.${fileExtension(f.name)}`;
      return ACCEPT_TYPES.includes(ext);
    });
    setFiles((prev) => {
      const existing = new Set(prev.map((file) => file.name + file.size));
      const deduped = arr.filter((file) => !existing.has(file.name + file.size));
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

  return (
    <main className="app-shell px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-8">
        <header className="fade-rise border-b hairline pb-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="eyebrow mb-3">Nexus // Organizational Survival Analysis</div>
              <h1 className="display-face max-w-4xl text-[clamp(3.3rem,8vw,6.5rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-[var(--foreground)]">
                Reveal the dependencies that can break the whole organization.
              </h1>
            </div>

            <div className="grid max-w-xl grid-cols-1 gap-2 text-sm text-[var(--muted)] sm:grid-cols-3">
              {SIGNALS.map((signal) => (
                <div
                  key={signal}
                  className="metric-chip rounded-full px-4 py-2 text-center"
                >
                  {signal}
                </div>
              ))}
            </div>
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-start">
          <div className="fade-rise-delay flex flex-col gap-8">
            <div className="max-w-2xl space-y-5">
              <p className="max-w-xl text-lg leading-8 text-[var(--muted-strong)] sm:text-xl">
                Upload your org data, build a living dependency map, and rank the
                catastrophic failure paths before they happen in production.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <ValueBlock label="Input" value="Any source" detail="CSV, docs, images, notes" />
                <ValueBlock label="Output" value="True graph" detail="Nodes, edges, weakpoints" />
                <ValueBlock label="Decision" value="Fix first" detail="Scenario-ranked action plan" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {PIPELINE_STEPS.map((step) => (
                <article
                  key={step.id}
                  className="control-surface rounded-[26px] p-5"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-soft)]">
                      {step.id}
                    </span>
                    <span className="h-px w-14 bg-white/10" />
                  </div>
                  <h2 className="display-face text-2xl font-medium tracking-[-0.03em] text-[var(--foreground)]">
                    {step.title}
                  </h2>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">
                    {step.detail}
                  </p>
                </article>
              ))}
            </div>

            <section className="control-surface-strong rounded-[34px] p-5 sm:p-7">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="eyebrow mb-2">Data Intake</div>
                    <h2 className="display-face text-[clamp(2rem,4vw,3rem)] font-medium tracking-[-0.04em] text-[var(--foreground)]">
                      Build the network.
                    </h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                      Start with one file or drop the full operational footprint.
                      We will extract entities, connect dependencies, and push the
                      session into the graph view.
                    </p>
                  </div>
                  <div className="metric-chip rounded-2xl px-4 py-3 text-sm">
                    Accepted formats: PDF, DOCX, XLSX, CSV, TSV, PNG, JPG, JSON, XML, TXT, MD
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      inputRef.current?.click();
                    }
                  }}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  className={`rounded-[28px] border border-dashed p-6 transition-all sm:p-8 ${
                    dragging
                      ? "border-[color:rgb(123_220_198_/_0.48)] bg-[color:rgb(123_220_198_/_0.08)]"
                      : "border-white/12 bg-white/[0.03] hover:border-[color:rgb(123_220_198_/_0.28)]"
                  }`}
                >
                  <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto] lg:items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                      <svg
                        className="h-7 w-7 text-[var(--accent-soft)]"
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
                    <div>
                      <p className="display-face text-2xl font-medium tracking-[-0.03em] text-[var(--foreground)]">
                        {dragging ? "Release to stage the files" : "Drop files or browse your source set"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        Use one employee CSV to test the full path, or combine org
                        charts, process docs, and operational notes for a richer graph.
                      </p>
                    </div>
                    <div className="justify-self-start lg:justify-self-end">
                      <button type="button" className="ghost-button rounded-full px-5 py-3 text-sm font-semibold">
                        Select Files
                      </button>
                    </div>
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
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                          Uploaded Payload
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          {files.length} file{files.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <ul className="custom-scrollbar grid max-h-64 gap-2 overflow-y-auto pr-1">
                        {files.map((file, index) => {
                          const ext = fileExtension(file.name);
                          return (
                            <li
                              key={`${file.name}-${file.size}`}
                              className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"
                            >
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.18em] ${badgeClass(ext)}`}
                              >
                                {ext || "file"}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">
                                {file.name}
                              </span>
                              <span className="text-xs text-[var(--muted)] tabular-nums">
                                {formatSize(file.size)}
                              </span>
                              <button
                                type="button"
                                className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFile(index);
                                }}
                              >
                                Remove
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    <div className="metric-chip rounded-[24px] px-4 py-4 text-sm lg:w-[220px]">
                      <div className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--accent-soft)]">
                        Suggested test path
                      </div>
                      Start with the org CSV, then expand into diagrams and process notes
                      to increase graph coverage.
                    </div>
                  </div>
                )}

                <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
                  <label className="field-shell block rounded-[26px] p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                      Organization context
                    </div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      placeholder="Example: 24-person SaaS company with a centralized platform team, revenue concentrated in enterprise sales, and a single office and AWS footprint."
                      className="min-h-[118px] w-full resize-y border-0 bg-transparent text-sm leading-6 text-[var(--foreground)] outline-none placeholder:text-[color:rgb(161_177_196_/_0.36)]"
                    />
                  </label>

                  <div className="flex flex-col gap-3 xl:min-w-[240px]">
                    <button
                      type="button"
                      className="accent-button rounded-full px-6 py-4 text-sm uppercase tracking-[0.24em] disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={handleBuild}
                      disabled={files.length === 0 || uploading}
                      suppressHydrationWarning
                    >
                      {uploading ? "Building Network" : "Build Network"}
                    </button>
                    <p className="text-xs leading-5 text-[var(--muted)]">
                      The graph becomes the source of truth for analysis, simulation,
                      and scenario ranking.
                    </p>
                  </div>
                </div>

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
                          Extracting entities, linking dependencies, and staging the
                          first graph state.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {showFollowUp && (
              <section className="control-surface rounded-[28px] p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="eyebrow mb-2">Analyst review</div>
                    <h3 className="display-face text-2xl font-medium tracking-[-0.03em] text-[var(--foreground)]">
                      The graph is ready with flagged coverage gaps.
                    </h3>
                  </div>
                  <div className="metric-chip rounded-full px-4 py-2 text-sm">
                    Confidence {Math.round((confidence ?? 0) * 100)}%
                  </div>
                </div>
                <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                        Follow-up questions
                      </p>
                      <ul className="space-y-2">
                        {followUpQuestions.map((question, index) => (
                          <li
                            key={question}
                            className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-[var(--foreground)]"
                          >
                            <span className="text-[var(--accent-soft)]">{index + 1}</span>
                            <span>{question}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {gaps.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                          Observed gaps
                        </p>
                        <ul className="space-y-2">
                          {gaps.map((gap) => (
                            <li
                              key={gap}
                              className="rounded-2xl border border-[color:rgb(215_195_106_/_0.18)] bg-[color:rgb(215_195_106_/_0.08)] px-4 py-3 text-sm text-[color:rgb(255_241_189)]"
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
                    className="accent-button rounded-full px-6 py-4 text-sm uppercase tracking-[0.24em]"
                    onClick={handleProceed}
                  >
                    Continue to network
                  </button>
                </div>
              </section>
            )}
          </div>

          <aside className="fade-rise flex flex-col gap-6 lg:sticky lg:top-24">
            <section className="control-surface-strong graph-preview-grid relative overflow-hidden rounded-[36px] p-6 sm:p-8">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="eyebrow mb-2">Live Preview</div>
                  <h2 className="display-face text-[clamp(2rem,4vw,3.4rem)] font-medium tracking-[-0.05em] text-[var(--foreground)]">
                    Dependency field
                  </h2>
                </div>
                <div className="metric-chip rounded-2xl px-4 py-3 text-xs">
                  Scenario engine armed
                </div>
              </div>

              <p className="max-w-lg text-sm leading-6 text-[var(--muted)] sm:text-base">
                The interface should feel like a resilience war room from the first
                screen. This preview hints at what the graph view becomes once the
                upload completes.
              </p>

              <div className="relative mt-8 overflow-hidden rounded-[28px] border border-white/10 bg-[color:rgb(6_13_24_/_0.54)] px-4 py-6 sm:px-6">
                <svg viewBox="0 0 400 270" className="h-auto w-full">
                  <defs>
                    <linearGradient id="edgeGlow" x1="0%" x2="100%">
                      <stop offset="0%" stopColor="rgba(132, 198, 244, 0.24)" />
                      <stop offset="100%" stopColor="rgba(123, 220, 198, 0.58)" />
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
                          stroke="rgba(128, 154, 196, 0.22)"
                          strokeWidth="1.5"
                        />
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke="url(#edgeGlow)"
                          strokeWidth="2.5"
                          strokeDasharray="8 20"
                          className="signal-track"
                        />
                      </g>
                    );
                  })}

                  {PREVIEW_NODES.map((node, index) => (
                    <g key={node.name} transform={`translate(${node.x}, ${node.y})`}>
                      <circle r={node.size + 16} fill={node.color} opacity="0.07" />
                      <circle r={node.size + 8} fill={node.color} opacity="0.05" />
                      <circle r={node.size + 18} stroke={node.color} strokeOpacity="0.32" fill="none">
                        {index < 2 ? (
                          <animate
                            attributeName="r"
                            values={`${node.size + 8};${node.size + 22}`}
                            dur="2.4s"
                            repeatCount="indefinite"
                          />
                        ) : null}
                        {index < 2 ? (
                          <animate
                            attributeName="opacity"
                            values="0.36;0"
                            dur="2.4s"
                            repeatCount="indefinite"
                          />
                        ) : null}
                      </circle>
                      <circle
                        r={node.size}
                        fill="rgba(8, 17, 31, 0.88)"
                        stroke={node.color}
                        strokeWidth="2"
                      />
                      <text
                        y={node.size + 19}
                        textAnchor="middle"
                        fill="var(--foreground)"
                        fontSize="11"
                        fontFamily="var(--font-body)"
                      >
                        {node.name}
                      </text>
                    </g>
                  ))}
                </svg>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <PreviewMetric label="People layer" value="14 nodes" accent="var(--accent-soft)" />
                  <PreviewMetric label="Critical path" value="3 jumps" accent="#f0b663" />
                  <PreviewMetric label="Collapse risk" value="0.28 H" accent="#e28766" />
                </div>
              </div>
            </section>

            <section className="control-surface rounded-[30px] p-6">
              <div className="eyebrow mb-2">Operator notes</div>
              <div className="space-y-4 text-sm leading-6 text-[var(--muted)]">
                <p>
                  Keep the graph as the largest visual object. Every deeper screen
                  should feel connected to this first decision.
                </p>
                <p>
                  The UI is deliberately dense but readable: less dashboard chrome,
                  more source-of-truth structure.
                </p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function ValueBlock({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="control-surface rounded-[22px] px-4 py-4">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
        {label}
      </div>
      <div className="display-face mt-2 text-2xl font-medium tracking-[-0.04em] text-[var(--foreground)]">
        {value}
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</p>
    </div>
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
    <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}
