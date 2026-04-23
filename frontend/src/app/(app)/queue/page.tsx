"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/shared/Button";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type Phase =
  | "pending"
  | "brief"
  | "outline"
  | "outline_review"
  | "generating"
  | "scoring"
  | "revising"
  | "done"
  | "error";

interface PipelineJob {
  id: string;
  brand_id: string;
  location_id: string | null;
  keyword: string;
  city: string;
  state: string;
  content_type: string;
  template_id: string | null;
  phase: Phase;
  brief: any;
  outline: any;
  content: string | null;
  score: any;
  error: string | null;
  revision_count: number;
  word_count: number;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  updated_at: string;
}

interface Brand {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Phase helpers                                                     */
/* ------------------------------------------------------------------ */

const phaseLabels: Record<Phase, string> = {
  pending: "Starting...",
  brief: "Analyzing SEO...",
  outline: "Building outline...",
  outline_review: "Awaiting approval",
  generating: "Writing...",
  scoring: "Scoring...",
  revising: "Revising...",
  done: "Done",
  error: "Failed",
};

const needsAttentionPhases = new Set<Phase>(["outline_review"]);
const inProgressPhases = new Set<Phase>([
  "pending",
  "brief",
  "outline",
  "generating",
  "scoring",
  "revising",
]);
const donePhases = new Set<Phase>(["done"]);
const errorPhases = new Set<Phase>(["error"]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
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

function overallScore(score: any): number | null {
  if (!score) return null;
  if (typeof score === "number") return score;
  if (typeof score.overall === "number") return score.overall;
  if (typeof score.total === "number") return score.total;
  return null;
}

function scoreColor(s: number): string {
  if (s >= 80) return "text-green";
  if (s >= 60) return "text-amber";
  return "text-[#b91c1c]";
}

/* ------------------------------------------------------------------ */
/*  StatusDot                                                         */
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

/* ------------------------------------------------------------------ */
/*  Section header                                                    */
/* ------------------------------------------------------------------ */

function SectionHeader({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
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

/* ------------------------------------------------------------------ */
/*  NeedsAttentionRow                                                 */
/* ------------------------------------------------------------------ */

function NeedsAttentionRow({
  job,
  onApprove,
  onDelete,
}: {
  job: PipelineJob;
  onApprove: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [fullJob, setFullJob] = useState<any>(null);

  async function loadFullJob() {
    if (fullJob) return;
    try {
      const res = await apiFetch(`/api/pipeline/status/${job.id}`);
      if (res.ok) setFullJob(await res.json());
    } catch {}
  }

  function handleExpand() {
    setExpanded(e => !e);
    if (!expanded) loadFullJob();
  }

  const outline = fullJob?.outline || job.outline;

  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 py-3 px-1 text-left cursor-pointer bg-transparent border-0 hover:bg-[rgba(0,0,0,0.02)] transition-colors"
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
              {(outline.sections || []).map((s: any, i: number) => (
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
          <Button
            variant="ink"
            size="sm"
            disabled={approving}
            onClick={async () => {
              setApproving(true);
              onApprove(job.id);
            }}
          >
            {approving ? "Approving..." : "Approve and generate"}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  InProgressRow                                                     */
/* ------------------------------------------------------------------ */

function InProgressRow({ job }: { job: PipelineJob }) {
  return (
    <div className="flex items-center gap-3 py-3 px-1 border-b border-line last:border-0">
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

/* ------------------------------------------------------------------ */
/*  CompletedRow                                                      */
/* ------------------------------------------------------------------ */

function CompletedRow({ job, onDelete }: { job: PipelineJob; onDelete?: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const score = overallScore(job.score);
  const preview = job.content ? job.content.slice(0, 200) : null;

  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 py-3 px-1 text-left cursor-pointer bg-transparent border-0 hover:bg-[rgba(0,0,0,0.02)] transition-colors"
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                window.location.href = `/generate?brand=${job.brand_id}`;
              }}
            >
              View full content
            </Button>
            {onDelete && (
              <button onClick={() => onDelete(job.id)} className="text-[11px] text-[#b91c1c]/50 hover:text-[#b91c1c] transition-colors">
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ErrorRow                                                          */
/* ------------------------------------------------------------------ */

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
    <div className="flex items-center gap-3 py-3 px-1 border-b border-line last:border-0">
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
          <button onClick={() => onDelete(job.id)} className="text-[11px] text-[#b91c1c]/50 hover:text-[#b91c1c] transition-colors">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function QueuePage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load brands on mount
  useEffect(() => {
    async function init() {
      try {
        const res = await apiFetch("/api/brands");
        if (!res.ok) return;
        const data: Brand[] = await res.json();
        setBrands(data);
      } catch {
        setError("Failed to load brands");
      }
      // Always fetch all jobs initially
      try {
        const url = "/api/pipeline/list?limit=20";
        const res = await apiFetch(url);
        if (res.ok) {
          const data: PipelineJob[] = await res.json();
          setJobs(data);
        }
      } catch {} finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Fetch jobs for brand
  const fetchJobs = useCallback(async (id: string) => {
    try {
      const url = id ? `/api/pipeline/list?brand_id=${id}&limit=20` : `/api/pipeline/list?limit=20`;
      const res = await apiFetch(url);
      if (!res.ok) {
        setError("Failed to load queue");
        return;
      }
      const data: PipelineJob[] = await res.json();
      setJobs(data);
      setError(null);
    } catch {
      setError("Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on brand change + start polling
  useEffect(() => {
    setLoading(true);
    fetchJobs(brandId);

    // Poll every 10 seconds
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetchJobs(brandId);
    }, 10_000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [brandId, fetchJobs]);

  // Approve outline
  async function handleApprove(jobId: string) {
    try {
      await apiFetch(`/api/pipeline/approve/${jobId}`, { method: "POST" });
      // Immediate refresh
      fetchJobs(brandId);
    } catch {
      setError("Failed to approve outline");
    }
  }

  // Retry failed job
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
        setError("Failed to retry job");
        return;
      }
      // Immediate refresh
      fetchJobs(brandId);
    } catch {
      setError("Failed to retry job");
    }
  }

  async function handleDelete(jobId: string) {
    try {
      await apiFetch(`/api/pipeline/${jobId}`, { method: "DELETE" });
      setJobs(prev => prev.filter(j => j.id !== jobId));
    } catch {
      setError("Failed to delete job");
    }
  }

  // Group jobs
  const needsAttention = jobs.filter((j) => needsAttentionPhases.has(j.phase));
  const inProgress = jobs.filter((j) => inProgressPhases.has(j.phase));
  const completed = jobs
    .filter((j) => donePhases.has(j.phase))
    .slice(0, 10);
  const failed = jobs.filter((j) => errorPhases.has(j.phase));

  const isEmpty =
    !loading &&
    needsAttention.length === 0 &&
    inProgress.length === 0 &&
    completed.length === 0 &&
    failed.length === 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h1 className="font-display font-[800] text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.035em] m-0">
          Copy queue
        </h1>

        {brands.length > 1 && (
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
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

      {/* Error */}
      {error && (
        <div className="border-[1.5px] border-[#b91c1c] rounded-pop px-5 py-3 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-[13px] text-ink-40 animate-pulse">
          Loading queue...
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="border-[1.5px] border-line rounded-pop-lg p-8 text-center">
          <div className="font-display font-normal text-pulp-deep text-lg mb-2">
            No jobs in the queue
          </div>
          <p className="text-[13px] text-ink-40 mb-4">
            Start generating content and your pipeline jobs will appear here.
          </p>
          <Button
            variant="ink"
            size="sm"
            onClick={() => {
              window.location.href = "/generate";
            }}
          >
            Generate content
          </Button>
        </div>
      )}

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <div>
          <SectionHeader label="Needs attention" count={needsAttention.length} />
          <div className="border-[1.5px] border-ink rounded-pop-lg bg-white">
            <div className="px-5 py-1">
              {needsAttention.map((job) => (
                <NeedsAttentionRow
                  key={job.id}
                  job={job}
                  onApprove={handleApprove}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* In progress */}
      {inProgress.length > 0 && (
        <div>
          <SectionHeader label="In progress" count={inProgress.length} />
          <div className="border-[1.5px] border-line rounded-pop-lg bg-white">
            <div className="px-5 py-1">
              {inProgress.map((job) => (
                <InProgressRow key={job.id} job={job} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recently completed */}
      {completed.length > 0 && (
        <div>
          <SectionHeader label="Recently completed" count={completed.length} />
          <div className="border-[1.5px] border-line rounded-pop-lg bg-white">
            <div className="px-5 py-1">
              {completed.map((job) => (
                <CompletedRow key={job.id} job={job} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Failed */}
      {failed.length > 0 && (
        <div>
          <SectionHeader label="Failed" count={failed.length} />
          <div className="border-[1.5px] border-[#b91c1c]/30 rounded-pop-lg bg-white">
            <div className="px-5 py-1">
              {failed.map((job) => (
                <ErrorRow key={job.id} job={job} onRetry={handleRetry} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
