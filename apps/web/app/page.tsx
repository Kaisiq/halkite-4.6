"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { AnimatedBeam } from "@/components/ui/animated-beam";
import { extractErrorMessage, joinWaitlist } from "@/lib/api";
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
const WAITLIST_EMAIL_PATTERN =
  /^(?=.{3,254}$)(?=.{1,64}@)[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

type GoogleTokenResponse = {
  access_token: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (_options?: { prompt?: string }) => void;
};

type GoogleTokenError = {
  message?: string;
  type?: string;
};

type DriveFolderNode = {
  id: string;
  name: string;
};

type InputSource = "files" | "drive" | null;

type GoogleAccounts = {
  oauth2: {
    initTokenClient: (_config: {
      client_id: string;
      scope: string;
      callback: (_response: GoogleTokenResponse) => void;
      error_callback?: (_error: GoogleTokenError) => void;
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
    id: "/01",
    title: "Ingest",
    detail: "Upload rosters, org charts, spreadsheets, notes, and diagrams.",
  },
  {
    id: "/02",
    title: "Map",
    detail: "Build a dependency graph across people, systems, and operations.",
  },
  {
    id: "/03",
    title: "Stress",
    detail: "Run weakpoint analysis and adversarial cascade exploration.",
  },
  {
    id: "/04",
    title: "Rank",
    detail: "Surface the catastrophic paths worth fixing first.",
  },
] as const;

const PRICING_PLANS = [
  {
    name: "SMB Starter",
    label: "50-150 employees",
    annualPrice: "€6,000",
    quarterlyInvoice: "€1,500",
    triennialPrice: "€15,300",
    theme: "default",
    purpose: "Low-friction entry point for founder, COO, or CTO-led teams that need structural risk visibility quickly.",
    bands: ["50-150 employees", "Annual contract only", "Q1 exit available for new customers"],
    features: [
      "Cloud only",
      "No SSO or on-prem deployment",
      "Built to prove value fast without enterprise overhead",
    ],
  },
  {
    name: "Growth",
    label: "151-500 employees",
    annualPrice: "€12,000-24,000",
    quarterlyInvoice: "€3,000-6,000",
    triennialPrice: "€30,600-61,200",
    theme: "muted",
    purpose: "For growing companies that need stronger exports, light role-based access, and a clean path into enterprise packaging.",
    bands: ["151-250: €12k", "251-350: €18k", "351-500: €24k"],
    features: [
      "Annual contract, billed quarterly in advance",
      "First-quarter exit rule for new customers",
      "Cloud by default with stronger exports and access controls",
    ],
  },
  {
    name: "Enterprise Platform",
    label: "500+ employees",
    annualPrice: "From €35,000",
    quarterlyInvoice: "From €8,750",
    triennialPrice: "From €89,250",
    theme: "dark",
    purpose: "Enterprise-first packaging for regulated organizations buying against consultant cost, compliance urgency, and deployment constraints.",
    bands: ["500-1,000: €35k", "1,001-2,500: €60k", "2,501-5,000: €95k", "5,001-10,000: €140k", "10,000+: custom"],
    features: [
      "SSO / SCIM, segmented data views, compliance reporting",
      "On-prem or isolated deployment options",
      "SLA-backed support and enterprise security review",
    ],
  },
] as const;

const PRICING_NOTES = [
  "All plans are annual contracts billed quarterly in advance.",
  "SMB Starter and Growth include a first-quarter exit rule for new customers.",
  "Three-year terms are priced at 15% off the equivalent three years of annual list price.",
  "Onboarding, isolated deployment, and custom compliance reporting are scoped separately.",
] as const;

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
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

function isValidWaitlistEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return WAITLIST_EMAIL_PATTERN.test(normalized) && !normalized.includes("..");
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
  const [activeSource, setActiveSource] = useState<InputSource>(null);
  const [driveFolderBrowserLoading, setDriveFolderBrowserLoading] =
    useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistCompany, setWaitlistCompany] = useState("");
  const [waitlistWebsite, setWaitlistWebsite] = useState("");
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [waitlistSuccess, setWaitlistSuccess] = useState<string | null>(null);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
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

  // Navigation after upload is handled by the /loading page.
  // This effect only covers the case where user returns here with
  // a completed session and no gaps (e.g. browser back button).
  useEffect(() => {
    if (!sessionId) return;
    if (uploading) return;
    if (gaps.length > 0 || followUpQuestions.length > 0) return;
    router.push(`/network/${sessionId}` as Route);
  }, [followUpQuestions.length, gaps.length, router, sessionId, uploading]);

  useEffect(() => {
    if (gaps.length > 0 || followUpQuestions.length > 0) {
      setShowFollowUp(true);
    }
  }, [gaps, followUpQuestions]);

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
    if (arr.length === 0) return;
    setActiveSource("files");
    setDriveDialogOpen(false);
    setDriveFolderId("");
    setDriveError(null);
    useNexusStore.setState({ driveFolder: null, uploadError: null });
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

  const handleBuild = () => {
    if (activeSource !== "files" || files.length === 0) return;
    uploadFiles(files, description || undefined);
    router.push("/loading" as Route);
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
    setActiveSource("drive");
    setFiles([]);
    useNexusStore.setState({ driveFolder: null, uploadError: null });
    importGoogleDriveFolder(
      driveAccessTokenRef.current,
      driveFolderId.trim(),
      description || undefined,
    );
    setDriveDialogOpen(false);
    router.push("/loading" as Route);
  }, [description, driveFolderId, importGoogleDriveFolder, router]);

  const handleWaitlistSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setWaitlistError(null);
      setWaitlistSuccess(null);

      const normalizedEmail = waitlistEmail.trim().toLowerCase();
      if (!isValidWaitlistEmail(normalizedEmail)) {
        setWaitlistError("Enter a valid email address.");
        return;
      }

      try {
        setWaitlistSubmitting(true);
        const response = await joinWaitlist(
          normalizedEmail,
          waitlistCompany.trim(),
          waitlistWebsite,
        );
        setWaitlistSuccess(response.message);
        setWaitlistEmail("");
        setWaitlistCompany("");
        setWaitlistWebsite("");
      } catch (error) {
        setWaitlistError(extractErrorMessage(error));
      } finally {
        setWaitlistSubmitting(false);
      }
    },
    [waitlistCompany, waitlistEmail, waitlistWebsite],
  );

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6 md:px-10">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.svg"
              alt="Halkantir"
              width={32}
              height={40}
              className="invert"
              style={{ width: 32, height: "auto" }}
            />
            <span className="text-[17px] font-semibold">Halkantir</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("upload-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="border border-[var(--text)] px-7 py-2.5 text-[15px] font-medium transition-all duration-200 hover:bg-[var(--text)] hover:text-white"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex min-h-screen flex-col justify-center px-6 pt-28 pb-16 md:px-10">
        <div className="mx-auto grid w-full max-w-[1400px] gap-12 lg:grid-cols-[minmax(0,1.2fr)_420px] lg:items-end">
          <div>
            <p className="mono-label">Deterministic Organizational Stress Testing</p>
            <h1 className="display-face mt-6 max-w-[900px] text-[clamp(3rem,7.5vw,6.5rem)] font-bold leading-[1.05] tracking-[-0.035em]">
              Find the dependencies
              that <span className="text-[var(--text-light)]">break</span> the
              organization.
            </h1>
            <p className="mt-8 max-w-[640px] text-[22px] leading-[1.5] text-[var(--text-muted)]">
              Deterministic stress-testing for complex human and technical
              systems. Map, analyze, and preempt catastrophic failure paths.
            </p>
            <div className="mt-12 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("upload-section");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
                className="border border-[var(--text)] bg-[var(--text)] px-12 py-4.5 text-[17px] font-medium text-white transition-all duration-200 hover:bg-white hover:text-[var(--text)]"
              >
                Get Started
              </button>
              <a
                href="#launch-access"
                className="border border-[var(--border-strong)] px-8 py-4.5 text-[15px] font-medium transition-all duration-200 hover:border-[var(--text)] hover:bg-[var(--bg-alt)]"
              >
                Join Launch List
              </a>
            </div>
          </div>

          <aside
            id="launch-access"
            className="dark-section relative overflow-hidden border border-white/10 p-7 sm:p-8"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_40%)]" />
            <div className="relative">
              <p className="mono-label">Launch Access</p>
              <h2 className="display-face mt-4 text-[clamp(2rem,4vw,2.8rem)] leading-[1.02] tracking-[-0.03em]">
                Request first-contact when Halkantir goes live.
              </h2>
              <p className="mt-4 max-w-sm text-[15px] leading-[1.7] text-white/68">
                Leave a work email and we will notify you when launch access
                opens. Abuse protection is enforced server-side.
              </p>

              <form className="mt-8 grid gap-4" onSubmit={handleWaitlistSubmit}>
                <label className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                    Work Email
                  </span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={waitlistEmail}
                    onChange={(event) => setWaitlistEmail(event.target.value)}
                    placeholder="team@company.com"
                    className="border border-white/14 bg-white/4 px-4 py-3.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/28 focus:border-white/50"
                    aria-invalid={waitlistError ? "true" : "false"}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                    Company
                  </span>
                  <input
                    type="text"
                    autoComplete="organization"
                    value={waitlistCompany}
                    onChange={(event) => setWaitlistCompany(event.target.value)}
                    placeholder="Optional"
                    className="border border-white/14 bg-white/4 px-4 py-3.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/28 focus:border-white/50"
                  />
                </label>

                <label
                  className="pointer-events-none absolute -left-[9999px] top-auto h-px w-px overflow-hidden opacity-0"
                  aria-hidden="true"
                >
                  <span>Website</span>
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={waitlistWebsite}
                    onChange={(event) => setWaitlistWebsite(event.target.value)}
                  />
                </label>

                <button
                  type="submit"
                  disabled={waitlistSubmitting}
                  className="mt-2 border border-white bg-white px-6 py-3.5 text-[15px] font-medium text-black transition-all duration-200 hover:bg-transparent hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {waitlistSubmitting ? "Submitting..." : "Notify Me At Launch"}
                </button>

                {waitlistError ? (
                  <p className="text-sm leading-relaxed text-[#ffb4b4]">
                    {waitlistError}
                  </p>
                ) : null}

                {waitlistSuccess ? (
                  <p className="text-sm leading-relaxed text-[#b7f3d4]">
                    {waitlistSuccess}
                  </p>
                ) : null}
              </form>
            </div>
          </aside>
        </div>
      </section>

      {/* Animated Beam — Integration Diagram */}
      <section className="border-t border-[var(--border)] px-6 md:px-10 py-24">
        <div className="mx-auto max-w-[1400px]">
          <IntegrationDiagram />
        </div>
      </section>

      {/* Our Platform */}
      <section className="border-t border-[var(--border)] px-6 md:px-10">
        <div className="mx-auto max-w-[1400px] py-10">
          <p className="text-[13px] text-[var(--text-muted)] mb-10">Our Platform</p>
          <div className="grid grid-cols-1 md:grid-cols-4">
            {PIPELINE_STEPS.map((step, i) => (
              <div
                key={step.id}
                className={`flex flex-col gap-2 py-6 ${i < PIPELINE_STEPS.length - 1 ? "md:border-r md:border-[var(--border)] md:pr-8 md:mr-8" : ""} ${i > 0 ? "border-t border-[var(--border)] md:border-t-0" : ""}`}
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="display-face text-[clamp(1.8rem,3vw,2.5rem)] font-normal tracking-[-0.02em]">
                    {step.title}
                  </h3>
                  <span className="font-mono text-[11px] text-[var(--text-light)]">
                    {step.id}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                  {step.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--border)] px-6 py-24 md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,340px)_1fr]">
            <div className="max-w-[320px]">
              <p className="mono-label">Pricing</p>
              <h2 className="display-face mt-4 text-[clamp(2.2rem,4.8vw,4.2rem)] font-normal leading-[1.02] tracking-[-0.03em]">
                Enterprise-first pricing by company size.
              </h2>
              <p className="mt-6 text-[17px] leading-[1.7] text-[var(--text-muted)]">
                Halkantir is sold on annual terms, priced primarily by employee
                count, and shaped to keep smaller teams moving while preserving
                enterprise delivery depth.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] lg:grid-cols-3">
              {PRICING_PLANS.map((plan) => {
                const isDark = plan.theme === "dark";
                const isMuted = plan.theme === "muted";

                return (
                  <article
                    key={plan.name}
                    className={`flex h-full flex-col ${
                      isDark
                        ? "bg-[var(--bg-dark)] text-[var(--text-inverse)]"
                        : isMuted
                          ? "bg-[var(--bg-alt)]"
                          : "bg-white"
                    }`}
                  >
                    <div className="flex flex-1 flex-col p-8 md:p-10">
                      <div className="flex min-h-[7.5rem] items-start justify-between gap-4">
                        <div>
                          <p
                            className={`font-mono text-[11px] uppercase tracking-[0.18em] ${
                              isDark
                                ? "text-white/45"
                                : "text-[var(--text-light)]"
                            }`}
                          >
                            {plan.label}
                          </p>
                          <h3 className="display-face mt-4 text-[2rem] leading-none tracking-[-0.03em]">
                            {plan.name}
                          </h3>
                        </div>
                        <span
                          className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${
                            isDark
                              ? "border-white/15 text-white/60"
                              : "border-[var(--border)] text-[var(--text-light)]"
                          }`}
                        >
                          Annual
                        </span>
                      </div>

                      <div
                        className={`mt-10 border-t pt-6 ${
                          isDark
                            ? "border-white/10"
                            : "border-[var(--border)]"
                        }`}
                      >
                        <p
                          className={`text-[12px] uppercase tracking-[0.16em] ${
                            isDark
                              ? "text-white/45"
                              : "text-[var(--text-light)]"
                          }`}
                        >
                          Starting annual price
                        </p>
                        <p className="mt-3 text-[2.6rem] font-semibold leading-none tracking-[-0.05em]">
                          {plan.annualPrice}
                        </p>
                        <div
                          className={`mt-6 grid gap-3 text-[14px] ${
                            isDark
                              ? "text-white/70"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4 border-b border-dashed pb-3 last:border-b-0 last:pb-0">
                            <span>Quarterly invoice</span>
                            <span
                              className={
                                isDark ? "text-white" : "text-[var(--text)]"
                              }
                            >
                              {plan.quarterlyInvoice}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4 border-b border-dashed pb-3 last:border-b-0 last:pb-0">
                            <span>3-year price</span>
                            <span
                              className={
                                isDark ? "text-white" : "text-[var(--text)]"
                              }
                            >
                              {plan.triennialPrice}
                            </span>
                          </div>
                        </div>
                      </div>

                      <p
                        className={`mt-8 min-h-[8rem] text-[15px] leading-[1.7] ${
                          isDark
                            ? "text-white/72"
                            : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {plan.purpose}
                      </p>

                      <div
                        className={`mt-8 border-t pt-6 ${
                          isDark
                            ? "border-white/10"
                            : "border-[var(--border)]"
                        }`}
                      >
                        <p
                          className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
                            isDark
                              ? "text-white/45"
                              : "text-[var(--text-light)]"
                          }`}
                        >
                          Price bands
                        </p>
                        <div className="mt-4 flex min-h-[7rem] flex-wrap content-start gap-2">
                          {plan.bands.map((band) => (
                            <span
                              key={band}
                              className={`rounded-full border px-3 py-1.5 text-[12px] ${
                                isDark
                                  ? "border-white/12 text-white/72"
                                  : "border-[var(--border)] text-[var(--text-muted)]"
                              }`}
                            >
                              {band}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div
                        className={`mt-8 border-t pt-6 ${
                          isDark
                            ? "border-white/10"
                            : "border-[var(--border)]"
                        }`}
                      >
                        <p
                          className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
                            isDark
                              ? "text-white/45"
                              : "text-[var(--text-light)]"
                          }`}
                        >
                          Commercial shape
                        </p>
                        <ul
                          className={`mt-4 min-h-[7.75rem] space-y-3 text-[14px] leading-[1.6] ${
                            isDark
                              ? "text-white/72"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          {plan.features.map((feature) => (
                            <li key={feature}>{feature}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="mt-10 grid gap-px border border-[var(--border)] bg-[var(--border)] md:grid-cols-2 xl:grid-cols-4">
            {PRICING_NOTES.map((note, index) => (
              <div key={note} className="bg-white px-6 py-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-light)]">
                  /0{index + 1}
                </p>
                <p className="mt-3 text-[14px] leading-[1.7] text-[var(--text-muted)]">
                  {note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Upload section */}
      <section id="upload-section" className="border-t border-[var(--border)] px-6 py-24 md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-16 max-w-[700px]">
            <h2 className="display-face text-[clamp(2.2rem,5vw,4rem)] font-normal leading-[1.1] tracking-[-0.025em]">
              Initialize organizational footprint.
            </h2>
            <p className="mt-6 text-[18px] leading-[1.6] text-[var(--text-muted)]">
              Start with your core roster or drop the full operational stack.
              We will extract entities, map dependencies, and stage the graph
              for adversarial simulation.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="border border-[var(--text)] bg-[var(--text)] px-8 py-3.5 text-[15px] font-medium text-white transition-all duration-200 hover:bg-white hover:text-[var(--text)]"
              >
                Upload Files
              </button>
              <button
                type="button"
                onClick={handleConnectGoogleDrive}
                disabled={uploading || driveAuthPending}
                className="flex items-center gap-2.5 border border-[var(--border-strong)] px-8 py-3.5 text-[15px] font-medium transition-all duration-200 hover:border-[var(--text)] hover:bg-[var(--bg-alt)] disabled:opacity-30"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {driveAuthPending ? "Authorizing..." : "Import from Google Drive"}
              </button>
            </div>
          </div>

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            className={`border border-dashed p-12 transition-colors cursor-pointer ${
              dragging
                ? "border-[var(--text)] bg-[var(--bg-alt)]"
                : "border-[var(--border-strong)] hover:border-[var(--text)] hover:bg-[var(--bg-alt)]"
            }`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <svg
                className="h-8 w-8 text-[var(--text-light)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                />
              </svg>
              <div>
                <p className="text-lg font-medium">
                  {dragging ? "Release to stage" : "Drop source files"}
                </p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  CSV, PDF, DOCX, XLSX, JSON, IMAGE
                </p>
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

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-8">
              <p className="mono-label mb-4">
                Staged: {files.length} file{files.length === 1 ? "" : "s"}
              </p>
              <ul className="custom-scrollbar max-h-[320px] divide-y divide-[var(--border)] overflow-y-auto border border-[var(--border)]">
                {files.map((file, index) => {
                  const ext = fileExtension(file.name);
                  return (
                    <li
                      key={`${file.name}-${file.size}`}
                      className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--bg-alt)]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--border)] font-mono text-[9px] font-medium uppercase">
                        {ext || "?"}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {file.name}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-light)]">
                          {formatSize(file.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-[var(--text-light)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
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
          )}

          {/* Description */}
          <div className="mt-8">
            <label className="flex flex-col gap-2">
              <span className="mono-label">Context (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Example: 24-person SaaS company with a centralized platform team, revenue concentrated in enterprise sales."
                className="w-full border border-[var(--border)] bg-transparent px-4 py-3 text-sm leading-relaxed outline-none transition-colors placeholder:text-[var(--text-light)] focus:border-[var(--text)]"
              />
            </label>
          </div>

          {/* Build action */}
          {files.length > 0 && (
            <div className="mt-8">
              <button
                type="button"
                className="border border-[var(--text)] bg-[var(--text)] px-10 py-3.5 text-[15px] font-medium text-white transition-all duration-200 hover:bg-white hover:text-[var(--text)] disabled:opacity-30"
                onClick={handleBuild}
                disabled={
                  files.length === 0 || uploading || activeSource === "drive"
                }
              >
                {uploading ? "Building..." : "Build Graph"}
              </button>
            </div>
          )}

          {/* Status messages */}
          {driveFolder && (
            <div className="mt-6 border border-[var(--border)] px-5 py-4 text-sm">
              Imported Drive folder{" "}
              <span className="font-medium">{driveFolder.name}</span> with{" "}
              {driveFolder.file_count} files
              {driveFolder.files_skipped > 0
                ? ` (${driveFolder.files_skipped} skipped)`
                : ""}
              .
            </div>
          )}

          {(driveError || uploadError) && (
            <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-[var(--danger)]">
              {driveError || uploadError}
            </div>
          )}

          {uploading && (
            <div className="mt-6 border border-[var(--border)] px-5 py-4">
              <p className="text-sm font-medium">{uploadProgress}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Extracting entities, linking dependencies, and staging the
                graph.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Drive folder browser dialog */}
      {driveDialogOpen && (
        <section className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8 backdrop-blur-sm sm:px-6">
          <div
            ref={driveDialogRef}
            className="relative w-full max-w-[900px] border border-[var(--border)] bg-white p-8 shadow-xl sm:p-12"
          >
            <div className="mb-10 flex items-start justify-between gap-6">
              <div>
                <p className="mono-label mb-3">Google Drive</p>
                <h3 className="display-face text-[clamp(1.5rem,3vw,2.5rem)] font-normal tracking-[-0.02em]">
                  Select target directory.
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">
                  Browse your Google Drive folders below. Selecting a root
                  folder with high connectivity will improve graph resolution.
                </p>
              </div>
              <button
                type="button"
                className="border border-[var(--border)] px-4 py-2 text-xs font-medium transition-colors hover:bg-[var(--bg-alt)]"
                onClick={() => setDriveDialogOpen(false)}
                disabled={isDriveImporting}
              >
                Close
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_200px] lg:items-end">
              <label className="flex flex-col gap-2">
                <span className="mono-label text-[10px]">Folder ID</span>
                <input
                  ref={driveFolderInputRef}
                  value={driveFolderId}
                  onChange={(e) => {
                    setDriveFolderId(e.target.value);
                    if (e.target.value.trim()) {
                      setActiveSource("drive");
                      setFiles([]);
                    }
                  }}
                  placeholder="Folder ID or URL"
                  className="w-full border border-[var(--border)] bg-transparent px-4 py-3 font-mono text-sm outline-none transition-colors placeholder:text-[var(--text-light)] focus:border-[var(--text)]"
                />
              </label>

              <button
                type="button"
                className="border border-[var(--text)] bg-[var(--text)] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--text-secondary)] disabled:opacity-30"
                onClick={handleImportGoogleDrive}
                disabled={uploading || driveFolderBrowserLoading}
              >
                {isDriveImporting ? "Importing..." : "Import"}
              </button>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="border border-[var(--border)] p-5">
                <p className="mono-label mb-2 text-[10px]">Selected</p>
                <p className="text-base font-medium">
                  {selectedDriveFolder?.name ||
                    displayDriveFolderLabel(driveFolderId)}
                </p>
                <p className="mt-2 font-mono text-[10px] text-[var(--text-light)]">
                  {selectedDriveFolder
                    ? selectedDriveFolder.id
                    : driveFolderId
                      ? "Manual reference"
                      : "Awaiting selection"}
                </p>
              </div>
              <div className="border border-[var(--border)] p-5">
                <p className="mono-label mb-2 text-[10px]">Sequence</p>
                <div className="space-y-2 font-mono text-xs">
                  <div
                    className={
                      driveAuthPending
                        ? "text-[var(--text)]"
                        : "text-[var(--text-light)]"
                    }
                  >
                    01 Authorize
                  </div>
                  <div
                    className={
                      driveDialogOpen
                        ? "text-[var(--text)]"
                        : "text-[var(--text-light)]"
                    }
                  >
                    02 Browse
                  </div>
                  <div
                    className={
                      isDriveImporting
                        ? "text-[var(--text)]"
                        : "text-[var(--text-light)]"
                    }
                  >
                    03 Ingest
                  </div>
                </div>
              </div>
            </div>

            {/* Folder browser */}
            <div className="mt-8 border border-[var(--border)] p-6">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {driveFolderPath.map((folder, index) => (
                  <div
                    key={`${folder.id}-${index}`}
                    className="flex items-center gap-2"
                  >
                    <button
                      type="button"
                      className="text-xs transition-colors hover:text-[var(--text)] disabled:opacity-30"
                      style={{
                        color:
                          index === driveFolderPath.length - 1
                            ? "var(--text)"
                            : "var(--text-light)",
                      }}
                      onClick={() => void handleJumpToDrivePath(index)}
                      disabled={driveFolderBrowserLoading}
                    >
                      {folder.name}
                    </button>
                    {index < driveFolderPath.length - 1 && (
                      <span className="text-[var(--text-light)]">/</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between mb-4">
                <p className="mono-label text-[10px]">Folders</p>
                <button
                  type="button"
                  className="text-xs text-[var(--text-light)] transition-colors hover:text-[var(--text)] disabled:opacity-30"
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
                  {driveFolderBrowserLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {driveFolderBrowserLoading ? (
                <div className="py-12 text-center">
                  <span className="mono-label text-[10px] animate-pulse">
                    Loading...
                  </span>
                </div>
              ) : driveFolders.length > 0 ? (
                <div className="divide-y divide-[var(--border)]">
                  {driveFolders.map((folder) => (
                    <div
                      key={folder.id}
                      className="group flex items-center justify-between gap-4 py-3 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {folder.name}
                        </p>
                        <p className="truncate font-mono text-[9px] text-[var(--text-light)]">
                          {folder.id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="border border-[var(--border)] px-3 py-1 text-xs transition-colors hover:bg-[var(--bg-alt)]"
                          onClick={() => setDriveFolderId(folder.id)}
                          onClickCapture={() => {
                            setActiveSource("drive");
                            setFiles([]);
                          }}
                          disabled={isDriveImporting}
                        >
                          Select
                        </button>
                        <button
                          type="button"
                          className="border border-[var(--border)] px-3 py-1 text-xs transition-colors hover:bg-[var(--bg-alt)]"
                          onClick={() => void handleOpenDriveFolder(folder)}
                          disabled={isDriveImporting}
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <span className="text-xs text-[var(--text-light)]">
                    No subdirectories found
                  </span>
                </div>
              )}
            </div>

            {(driveError || uploadError) && (
              <div className="mt-4 border border-red-200 bg-red-50 px-5 py-4 text-sm text-[var(--danger)]">
                {driveError || uploadError}
              </div>
            )}

            {isDriveImporting && (
              <div className="absolute inset-0 z-[60] flex items-center justify-center bg-white/90 backdrop-blur-sm">
                <div className="w-full max-w-md border border-[var(--border)] bg-white p-10">
                  <div className="mb-6 flex items-center gap-4">
                    <div className="relative h-10 w-10">
                      <span className="drive-import-spinner absolute inset-0 border-2 border-transparent border-t-[var(--text)]" />
                    </div>
                    <div>
                      <p className="mono-label text-[10px]">Importing</p>
                      <p className="text-base font-medium">
                        {uploadProgress || "Mapping tree"}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4 h-px w-full bg-[var(--border)]">
                    <div className="h-full w-1/2 animate-pulse bg-[var(--text)]" />
                  </div>

                  <p className="font-mono text-[10px] text-[var(--text-light)]">
                    Target: {selectedDriveFolder?.name || "Remote source"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Follow-up section */}
      {showFollowUp && (
        <section className="border-t border-[var(--border)] px-6 py-24">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-10 flex items-start justify-between gap-6">
              <div>
                <p className="mono-label mb-3">Validation</p>
                <h3 className="display-face text-[clamp(1.5rem,3vw,2.5rem)] font-normal tracking-[-0.02em]">
                  Coverage gaps detected.
                </h3>
              </div>
              <div className="border border-[var(--border)] px-5 py-3">
                <p className="mono-label text-[9px] mb-1">Confidence</p>
                <p className="text-xl font-medium">
                  {Math.round((confidence ?? 0) * 100)}%
                </p>
              </div>
            </div>

            <div className="grid gap-10 md:grid-cols-2">
              {followUpQuestions.length > 0 && (
                <div>
                  <p className="mono-label mb-4 text-[10px]">
                    Clarifications needed
                  </p>
                  <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
                    {followUpQuestions.map((question, index) => (
                      <li
                        key={question}
                        className="flex gap-4 px-4 py-3 text-sm leading-relaxed"
                      >
                        <span className="font-mono text-[10px] text-[var(--text-light)]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span>{question}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {gaps.length > 0 && (
                <div>
                  <p className="mono-label mb-4 text-[10px]">Topology gaps</p>
                  <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
                    {gaps.map((gap) => (
                      <li
                        key={gap}
                        className="px-4 py-3 text-sm leading-relaxed"
                      >
                        {gap}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-10">
              <button
                type="button"
                className="border border-[var(--text)] bg-[var(--text)] px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--text-secondary)]"
                onClick={handleProceed}
              >
                Continue
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Integration Diagram — Animated Beams
// ---------------------------------------------------------------------------

const BEAM_COLORS = {
  path: "#e5e5e5",
  gradientStart: "#000000",
  gradientStop: "#666666",
};

function DiagramNode({
  ref,
  label,
  sub,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  label: string;
  sub?: string;
}) {
  return (
    <div
      ref={ref}
      className="z-10 flex flex-col items-center justify-center border border-[var(--border)] bg-white px-6 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
    >
      <span className="text-[16px] font-semibold">{label}</span>
      {sub && (
        <span className="text-[12px] text-[var(--text-light)]">{sub}</span>
      )}
    </div>
  );
}

function IntegrationDiagram() {
  const containerRef = useRef<HTMLDivElement>(null);

  const srcPdfRef = useRef<HTMLDivElement>(null);
  const srcCsvRef = useRef<HTMLDivElement>(null);
  const srcDocRef = useRef<HTMLDivElement>(null);
  const srcDriveRef = useRef<HTMLDivElement>(null);

  const coreRef = useRef<HTMLDivElement>(null);

  const outGraphRef = useRef<HTMLDivElement>(null);
  const outAnalysisRef = useRef<HTMLDivElement>(null);
  const outReportRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto flex max-w-[900px] items-center justify-between py-12"
    >
      {/* Left — Source inputs */}
      <div className="flex flex-col gap-2.5">
        <DiagramNode ref={srcPdfRef} label="PDF" sub="Org charts" />
        <DiagramNode ref={srcCsvRef} label="CSV" sub="Rosters" />
        <DiagramNode ref={srcDocRef} label="DOCX" sub="Policies" />
        <DiagramNode ref={srcDriveRef} label="Drive" sub="Folders" />
      </div>

      {/* Center — Core engine */}
      <div
        ref={coreRef}
        className="z-10 flex flex-col items-center justify-center border-2 border-[var(--text)] bg-[var(--text)] px-12 py-8 text-white"
      >
        <Image
          src="/logo.svg"
          alt=""
          width={32}
          height={40}
          className="mb-3"
          style={{ width: 32, height: "auto" }}
        />
        <span className="text-[17px] font-semibold">Halkantir</span>
        <span className="text-[11px] text-white/60">Resilience Engine</span>
      </div>

      {/* Right — Outputs */}
      <div className="flex flex-col gap-2.5">
        <DiagramNode ref={outGraphRef} label="Graph" sub="Dependencies" />
        <DiagramNode ref={outAnalysisRef} label="Analysis" sub="Weakpoints" />
        <DiagramNode ref={outReportRef} label="Report" sub="Scenarios" />
      </div>

      {/* Beams — inputs to core */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={srcPdfRef}
        toRef={coreRef}
        pathColor={BEAM_COLORS.path}
        gradientStartColor={BEAM_COLORS.gradientStart}
        gradientStopColor={BEAM_COLORS.gradientStop}
        duration={4}
        curvature={-30}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={srcCsvRef}
        toRef={coreRef}
        pathColor={BEAM_COLORS.path}
        gradientStartColor={BEAM_COLORS.gradientStart}
        gradientStopColor={BEAM_COLORS.gradientStop}
        duration={4}
        delay={0.5}
        curvature={-10}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={srcDocRef}
        toRef={coreRef}
        pathColor={BEAM_COLORS.path}
        gradientStartColor={BEAM_COLORS.gradientStart}
        gradientStopColor={BEAM_COLORS.gradientStop}
        duration={4}
        delay={1}
        curvature={10}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={srcDriveRef}
        toRef={coreRef}
        pathColor={BEAM_COLORS.path}
        gradientStartColor={BEAM_COLORS.gradientStart}
        gradientStopColor={BEAM_COLORS.gradientStop}
        duration={4}
        delay={1.5}
        curvature={30}
      />

      {/* Beams — core to outputs */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={coreRef}
        toRef={outGraphRef}
        pathColor={BEAM_COLORS.path}
        gradientStartColor={BEAM_COLORS.gradientStart}
        gradientStopColor={BEAM_COLORS.gradientStop}
        duration={4}
        delay={2}
        curvature={-20}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={coreRef}
        toRef={outAnalysisRef}
        pathColor={BEAM_COLORS.path}
        gradientStartColor={BEAM_COLORS.gradientStart}
        gradientStopColor={BEAM_COLORS.gradientStop}
        duration={4}
        delay={2.5}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={coreRef}
        toRef={outReportRef}
        pathColor={BEAM_COLORS.path}
        gradientStartColor={BEAM_COLORS.gradientStart}
        gradientStopColor={BEAM_COLORS.gradientStop}
        duration={4}
        delay={3}
        curvature={20}
      />
    </div>
  );
}
