"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch, apiFetchOk } from "@/lib/api";
import {
  ACTIVE_PIPELINE_PHASES,
  FRANCHISE_PAGE_TYPES,
  type Brand,
  type Generation,
  type OutlineSection,
  type PipelineJob,
  type PipelinePhase,
  type PopScore,
} from "@/lib/types";
import { Button } from "@/components/shared/Button";
import { GenerationsList } from "@/components/history/GenerationsList";
import { GenerationDetail } from "@/components/history/GenerationDetail";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Phase = PipelinePhase;

/* ------------------------------------------------------------------ */
/*  Phase helpers                                                      */
/* ------------------------------------------------------------------ */

const phaseLabels: Record<Phase, string> = {
  pending: "Starting...",
  brief: "Analyzing SEO...",
  research: "Researching...",
  outline: "Building outline...",
  outline_review: "Awaiting approval",
  generating: "Writing...",
  scoring: "Scoring...",
  revising: "Revising...",
  done: "Done",
  error: "Failed",
};

const needsAttentionPhases = new Set<Phase>(["outline_review"]);
const inProgressPhases = ACTIVE_PIPELINE_PHASES;
const donePhases = new Set<Phase>(["done"]);
const errorPhases = new Set<Phase>(["error"]);

/* Polling limits */
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_FAILURES = 5;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function elapsedTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);
  if (mins > 0) return `${mins}:${secs.toString().padStart(2, "0")}`;
  return `${secs}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function overallScore(score: PipelineJob["score"]): number | null {
  if (!score) return null;
  if (typeof score === "number") return score;
  const s = score as Partial<PopScore> & { overall?: number; total?: number };
  if (typeof s.overall_score === "number") return s.overall_score;
  if (typeof s.overall === "number") return s.overall;
  if (typeof s.total === "number") return s.total;
  return null;
}

function scoreColor(s: number): string {
  if (s >= 80) return "text-green";
  if (s >= 60) return "text-amber";
  return "text-[#b91c1c]";
}

/* ------------------------------------------------------------------ */
/*  Queue sub-components (unexported — Next.js errors on named exports */
/*  from page.tsx)                                                     */
/* ------------------------------------------------------------------ */

function StatusDot({ phase }: { phase: Phase }) {
  if (donePhases.has(phase)) {
    return <span className="w-2 h-2 rounded-full bg-green flex-none" />;
  }
  if (needsAttentionPhases.has(phase)) {
    return (
      <span className="w-2 h-2 rounded-full bg-pulp-deep flex-none animate-pulse" />
    );
  }
  if (inProgressPhases.has(phase)) {
    return (
      <span className="w-2 h-2 rounded-full bg-amber flex-none animate-pulse" />
    );
  }
  return <span className="w-2 h-2 rounded-full bg-[#b91c1c] flex-none" />;
}

function QueueSectionHeader({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2.5 mb-2">
      <span className="text-[10px] tracking-[0.22em] uppercase text-ink-40">
        {label}
      </span>
      <span className="text-[10px] text-ink-40">{count}</span>
    </div>
  );
}

function NeedsAttentionRow({
  job,
  onApprove,
}: {
  job: PipelineJob;
  onApprove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fullJob, setFullJob] = useState<PipelineJob | null>(null);
  const [loadingOutline, setLoadingOutline] = useState(false);
  const [outlineError, setOutlineError] = useState<string | null>(null);

  async function loadFullJob() {
    if (fullJob) return;
    setLoadingOutline(true);
    setOutlineError(null);
    try {
      const res = await apiFetchOk(`/api/pipeline/status/${job.id}`);
      setFullJob(await res.json());
    } catch (err) {
      console.error("Failed to load outline:", err);
      setOutlineError("Failed to load the outline. Collapse and try again.");
    } finally {
      setLoadingOutline(false);
    }
  }

  function handleExpand() {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand) loadFullJob();
  }

  const outline = fullJob?.outline || job.outline;

  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={handleExpand}
        className="w-full flex items-center gap-3 py-2 px-1 text-left cursor-pointer bg-transparent border-0 hover:bg-[rgba(0,0,0,0.02)] transition-colors"
      >
        <StatusDot phase={job.phase} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-ink truncate">{job.keyword}</div>
          <div className="text-[11px] text-ink-40">
            {job.city}, {job.state}
          </div>
        </div>
        <span className="text-[11px] text-ink-40 flex-none">
          {relativeTime(job.created_at)}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-ink-40 flex-none transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>

      {expanded && loadingOutline && (
        <div className="px-1 pb-4">
          <div className="text-[12px] text-ink-40 animate-pulse">Loading outline...</div>
        </div>
      )}

      {expanded && outlineError && (
        <div className="px-1 pb-4">
          <div className="text-[12px] text-[#b91c1c]">{outlineError}</div>
        </div>
      )}

      {expanded && outline && (
        <div className="px-1 pb-4 space-y-3">
          <div className="border border-line rounded-[14px] p-4 space-y-2">
            <div className="font-display font-normal text-pulp-deep text-[15px]">
              {outline.h1}
            </div>
            {outline.estimated_word_count && (
              <div className="text-[11px] text-ink-40">
                ~{outline.estimated_word_count} words
              </div>
            )}
            <div className="space-y-1.5">
              {(outline.sections || []).map((s: OutlineSection, i: number) => (
                <div key={i}>
                  <div className="font-display font-normal text-pulp-deep text-[13px]">
                    {s.h2}
                  </div>
                  {s.key_points && (
                    <ul className="mt-0.5 space-y-0">
                      {s.key_points.map((kp: string, j: number) => (
                        <li
                          key={j}
                          className="text-[11px] text-ink-70 flex gap-1.5"
                        >
                          <span className="text-ink-40">-</span> {kp}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
          <a
            href={`/generate?pipeline=${job.id}`}
            className="inline-flex items-center justify-center gap-2 h-8 px-3.5 text-[11px] font-medium tracking-[0.04em] rounded-full border-[1.5px] bg-ink text-white border-ink transition-all hover:-translate-y-px hover:bg-pulp hover:text-ink hover:border-pulp"
          >
            Open
          </a>
        </div>
      )}
    </div>
  );
}

function InProgressRow({ job }: { job: PipelineJob }) {
  return (
    <div className="flex items-center gap-3 py-2 px-1 border-b border-line last:border-0">
      <StatusDot phase={job.phase} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink truncate">{job.keyword}</div>
        <div className="text-[11px] text-ink-40">
          {job.city}, {job.state}
        </div>
      </div>
      <span className="text-[11px] text-ink-70 flex-none">
        {phaseLabels[job.phase]}
      </span>
      <span className="text-[11px] text-ink-40 font-mono flex-none">
        {elapsedTime(job.created_at)}
      </span>
    </div>
  );
}

function CompletedRow({
  job,
  onDelete,
}: {
  job: PipelineJob;
  onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const score = overallScore(job.score);
  const preview = job.content ? job.content.slice(0, 200) : null;

  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 py-2 px-1 text-left cursor-pointer bg-transparent border-0 hover:bg-[rgba(0,0,0,0.02)] transition-colors"
      >
        <StatusDot phase={job.phase} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-ink truncate">{job.keyword}</div>
          <div className="text-[11px] text-ink-40">
            {job.city}, {job.state}
          </div>
        </div>
        <div className="flex items-center gap-4 flex-none">
          {job.word_count > 0 && (
            <span className="text-[11px] text-ink-40">
              {job.word_count.toLocaleString()} words
            </span>
          )}
          {score !== null && (
            <span
              className={`text-[12px] font-display font-[800] ${scoreColor(score)}`}
            >
              {score}
            </span>
          )}
          <span className="text-[11px] text-ink-40 w-[60px] text-right">
            {formatDate(job.created_at)}
          </span>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-ink-40 flex-none transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>

      {expanded && (
        <div className="px-1 pb-4 space-y-3">
          {preview && (
            <div className="text-[12px] text-ink-70 leading-relaxed border border-line rounded-[14px] p-4">
              {preview}
              {job.content && job.content.length > 200 && (
                <span className="text-ink-40">...</span>
              )}
            </div>
          )}

          {score !== null && job.score && typeof job.score === "object" && (
            <div className="flex gap-3 flex-wrap text-[11px]">
              {Object.entries(job.score)
                .filter(([k]) => k !== "overall" && k !== "total")
                .map(([k, v]) => (
                  <span key={k} className="text-ink-40">
                    {k.replace(/_/g, " ")}:{" "}
                    <span className="text-ink">{String(v)}</span>
                  </span>
                ))}
            </div>
          )}

          <div className="flex gap-2">
            {job.content && (
              <Button
                variant="light"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(job.content!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
            <a
              href={`/generate?pipeline=${job.id}`}
              className="inline-flex items-center justify-center h-8 px-3.5 text-[11px] font-medium tracking-[0.04em] rounded-full border-[1.5px] border-ink text-ink bg-transparent transition-all hover:bg-ink hover:text-white"
            >
              Open
            </a>
            {onDelete && (
              <button
                onClick={() => onDelete(job.id)}
                className="text-[11px] text-[#b91c1c]/50 hover:text-[#b91c1c] transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorRow({
  job,
  onRetry,
  onDelete,
}: {
  job: PipelineJob;
  onRetry: (job: PipelineJob) => void;
  onDelete?: (id: string) => void;
}) {
  const [retrying, setRetrying] = useState(false);

  return (
    <div className="flex items-center gap-3 py-2 px-1 border-b border-line last:border-0">
      <StatusDot phase={job.phase} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink truncate">{job.keyword}</div>
        <div className="text-[11px] text-ink-40">
          {job.city}, {job.state}
        </div>
      </div>
      <span className="text-[11px] text-[#b91c1c] flex-1 min-w-0 truncate">
        {job.error || "Unknown error"}
      </span>
      <span className="text-[11px] text-ink-40 flex-none">
        {formatDate(job.created_at)}
      </span>
      <div className="flex gap-2">
        <Button
          variant="light"
          size="sm"
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            onRetry(job);
          }}
        >
          {retrying ? "Retrying..." : "Retry"}
        </Button>
        {onDelete && (
          <button
            onClick={() => onDelete(job.id)}
            className="text-[11px] text-[#b91c1c]/50 hover:text-[#b91c1c] transition-colors"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  InProgressSection — queue UI (hidden when no active jobs)         */
/* ------------------------------------------------------------------ */

function InProgressSection({
  brands,
  brandId,
  onBrandChange,
  jobs,
  loading,
  error,
  onApprove,
  onRetry,
  onDelete,
}: {
  brands: Brand[];
  brandId: string;
  onBrandChange: (id: string) => void;
  jobs: PipelineJob[];
  loading: boolean;
  error: string | null;
  onApprove: (id: string) => void;
  onRetry: (job: PipelineJob) => void;
  onDelete: (id: string) => void;
}) {
  const needsAttention = jobs.filter((j) => needsAttentionPhases.has(j.phase));
  const inProgress = jobs.filter((j) => inProgressPhases.has(j.phase));
  const completed = jobs.filter((j) => donePhases.has(j.phase)).slice(0, 10);
  const failed = jobs.filter((j) => errorPhases.has(j.phase));

  const hasActive =
    needsAttention.length > 0 ||
    inProgress.length > 0 ||
    completed.length > 0 ||
    failed.length > 0;

  // While loading: show nothing (no spinner flash)
  if (loading) return null;

  // After load: hide entirely when there are no active/reviewable jobs
  if (!hasActive) return null;

  return (
    <div className="space-y-6">
      {/* Section heading row with optional brand filter */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="font-display font-[800] text-[clamp(28px,3vw,40px)] leading-[0.95] tracking-[-0.03em] m-0">
          In progress
        </h2>
        {brands.length > 1 && (
          <select
            value={brandId}
            onChange={(e) => onBrandChange(e.target.value)}
            className="h-10 border-[1.5px] border-line rounded-lg bg-white text-ink px-3 pr-8 text-[12px] outline-none focus:border-ink cursor-pointer"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="border-[1.5px] border-[#b91c1c] rounded-pop px-5 py-3 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
          {error}
        </div>
      )}

      {needsAttention.length > 0 && (
        <div>
          <QueueSectionHeader label="Needs attention" count={needsAttention.length} />
          <div className="border-[1.5px] border-ink rounded-pop-lg bg-white">
            <div className="px-5 py-1">
              {needsAttention.map((job) => (
                <NeedsAttentionRow
                  key={job.id}
                  job={job}
                  onApprove={onApprove}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {inProgress.length > 0 && (
        <div>
          <QueueSectionHeader label="In progress" count={inProgress.length} />
          <div className="border-[1.5px] border-line rounded-pop-lg bg-white">
            <div className="px-5 py-1">
              {inProgress.map((job) => (
                <InProgressRow key={job.id} job={job} />
              ))}
            </div>
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <QueueSectionHeader label="Recently completed" count={completed.length} />
          <div className="border-[1.5px] border-line rounded-pop-lg bg-white">
            <div className="px-5 py-1">
              {completed.map((job) => (
                <CompletedRow key={job.id} job={job} onDelete={onDelete} />
              ))}
            </div>
          </div>
        </div>
      )}

      {failed.length > 0 && (
        <div>
          <QueueSectionHeader label="Failed" count={failed.length} />
          <div className="border-[1.5px] border-[#b91c1c]/30 rounded-pop-lg bg-white">
            <div className="px-5 py-1">
              {failed.map((job) => (
                <ErrorRow
                  key={job.id}
                  job={job}
                  onRetry={onRetry}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FinishedPagesSection — history UI                                  */
/* ------------------------------------------------------------------ */

function FinishedPagesSection({
  generations,
  selected,
  loading,
  error,
  onSelect,
  onDelete,
  onClose,
}: {
  generations: Generation[];
  selected: Generation | null;
  loading: boolean;
  error: string | null;
  onSelect: (gen: Generation) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-6">
      <h2 className="font-display font-[800] text-[clamp(28px,3vw,40px)] leading-[0.95] tracking-[-0.03em] m-0">
        Finished pages
      </h2>

      {error && (
        <div className="border-[1.5px] border-[#b91c1c] rounded-[14px] px-5 py-3 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-ink-40 animate-pulse">
          Loading generations...
        </div>
      ) : (
        <>
          <GenerationsList
            generations={generations}
            selectedId={selected?.id || null}
            onSelect={onSelect}
            onDelete={onDelete}
          />
          {selected && (
            <GenerationDetail generation={selected} onClose={onClose} />
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PagesPage() {
  /* ---- Queue state ---- */
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailuresRef = useRef(0);

  /* ---- History state ---- */
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selected, setSelected] = useState<Generation | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Queue effects / handlers                                        */
  /* ---------------------------------------------------------------- */

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Load brands on mount
  useEffect(() => {
    async function init() {
      try {
        const res = await apiFetch("/api/brands");
        if (!res.ok) return;
        const data: Brand[] = await res.json();
        setBrands(data);
      } catch {
        setQueueError("Failed to load brands");
      }
      // Always fetch all jobs initially
      try {
        const url = "/api/pipeline/list?limit=20";
        const res = await apiFetch(url);
        if (res.ok) {
          const data: PipelineJob[] = await res.json();
          setJobs(data);
        }
      } catch (err) {
        console.error("Failed to load queue:", err);
        setQueueError("Failed to load queue");
      } finally {
        setQueueLoading(false);
      }
    }
    init();
  }, []);

  const fetchJobs = useCallback(async (id: string) => {
    try {
      const url = id
        ? `/api/pipeline/list?brand_id=${id}&limit=20`
        : `/api/pipeline/list?limit=20`;
      const res = await apiFetchOk(url);
      const data: PipelineJob[] = await res.json();
      pollFailuresRef.current = 0;
      setJobs(data);
      setQueueError(null);
    } catch (err) {
      console.error("Failed to load queue:", err);
      pollFailuresRef.current += 1;
      if (pollFailuresRef.current >= MAX_POLL_FAILURES && pollRef.current) {
        stopPolling();
        setQueueError(
          "Failed to load the queue repeatedly. Refresh the page to retry."
        );
      } else {
        setQueueError("Failed to load queue");
      }
    } finally {
      setQueueLoading(false);
    }
  }, []);

  // Fetch on brand change + start polling
  useEffect(() => {
    setQueueLoading(true);
    pollFailuresRef.current = 0;
    fetchJobs(brandId);

    // Poll every 10 seconds, with a hard cap so we never poll forever
    const startedAt = Date.now();
    stopPolling();
    pollRef.current = setInterval(() => {
      if (Date.now() - startedAt > MAX_POLL_DURATION_MS) {
        stopPolling();
        setQueueError(
          "Auto-refresh paused. Refresh the page to see the latest jobs."
        );
        return;
      }
      fetchJobs(brandId);
    }, POLL_INTERVAL_MS);

    return stopPolling;
  }, [brandId, fetchJobs]);

  async function handleApprove(jobId: string) {
    try {
      await apiFetchOk(`/api/pipeline/approve/${jobId}`, { method: "POST" });
      fetchJobs(brandId);
    } catch {
      setQueueError("Failed to approve outline");
    }
  }

  async function handleRetry(job: PipelineJob) {
    try {
      const res = await apiFetch("/api/pipeline/start", {
        method: "POST",
        body: JSON.stringify({
          keyword: job.keyword,
          city: job.city,
          state: job.state,
          brand_id: job.brand_id,
          location_id: job.location_id || undefined,
          template_id: job.template_id || undefined,
          content_type: job.content_type,
        }),
      });
      if (!res.ok) {
        setQueueError("Failed to retry job");
        return;
      }
      fetchJobs(brandId);
    } catch {
      setQueueError("Failed to retry job");
    }
  }

  async function handleQueueDelete(jobId: string) {
    try {
      await apiFetchOk(`/api/pipeline/${jobId}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch {
      setQueueError("Failed to delete job");
    }
  }

  /* ---------------------------------------------------------------- */
  /*  History effects / handlers                                      */
  /* ---------------------------------------------------------------- */

  const loadGenerations = useCallback(async () => {
    try {
      const res = await apiFetch("/api/generations");
      if (res.ok) {
        const data = await res.json();
        setGenerations(data);
        setHistoryError(null);
      } else {
        setHistoryError("Failed to load generations. Refresh the page to try again.");
      }
    } catch (err) {
      console.error("Failed to load generations:", err);
      setHistoryError("Failed to load generations. Refresh the page to try again.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGenerations();
  }, [loadGenerations]);

  async function handleHistoryDelete(id: string) {
    try {
      await apiFetchOk(`/api/generations/${id}`, { method: "DELETE" });
      setGenerations((prev) => prev.filter((g) => g.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      console.error("Failed to delete generation:", err);
      setHistoryError("Failed to delete the generation. Try again.");
    }
  }

  async function handleSelect(gen: Generation) {
    try {
      const res = await apiFetchOk(`/api/generations/${gen.id}`);
      const full = await res.json();
      setSelected(full);
      setHistoryError(null);
    } catch (err) {
      console.error("Failed to load generation detail:", err);
      setHistoryError("Failed to load that generation. Try again.");
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-10">
      {/* Page heading */}
      <h1 className="font-display font-[800] text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.035em] m-0">
        Pages
      </h1>

      {/* In progress — hidden entirely when no active jobs (and during initial load) */}
      <InProgressSection
        brands={brands}
        brandId={brandId}
        onBrandChange={setBrandId}
        jobs={jobs}
        loading={queueLoading}
        error={queueError}
        onApprove={handleApprove}
        onRetry={handleRetry}
        onDelete={handleQueueDelete}
      />

      {/* Finished pages */}
      <FinishedPagesSection
        generations={generations}
        selected={selected}
        loading={historyLoading}
        error={historyError}
        onSelect={handleSelect}
        onDelete={handleHistoryDelete}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
