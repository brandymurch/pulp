"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch, apiFetchOk } from "@/lib/api";
import {
  type Brand,
  type FranchiseFactSheet,
  type FranchiseGeneratePayload,
  type FranchiseContentPlan,
  type PlanPage,
  type PlanKeyword,
  type PlanOutlineItem,
  FRANCHISE_PAGE_TYPES,
} from "@/lib/types";
import { Button } from "@/components/shared/Button";
import { useGeneration } from "@/hooks/useGeneration";

// ---------------------------------------------------------------------------
// Polling constants — mirror the pattern from generate/page.tsx
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_FAILURES = 5;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10-minute hard cap (scrape)
const MAX_PLAN_POLL_DURATION_MS = 15 * 60 * 1000; // 15-minute hard cap (plan)

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Split a textarea value into a trimmed, non-empty string array. */
function splitLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Join a string array back into a textarea-friendly string. */
function joinLines(arr?: string[]): string {
  return (arr ?? []).join("\n");
}

/** Format elapsed seconds as "Xm Ys" or "Xs". */
function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Parse outline textarea lines ("H2 | note") into PlanOutlineItem[]. */
function parseOutlineLines(raw: string): PlanOutlineItem[] {
  return splitLines(raw).map((line) => {
    const idx = line.indexOf("|");
    if (idx === -1) return { h2: line.trim(), note: "" };
    return { h2: line.slice(0, idx).trim(), note: line.slice(idx + 1).trim() };
  });
}

/** Serialize PlanOutlineItem[] to textarea string. */
function serializeOutlineItems(items: PlanOutlineItem[]): string {
  return items.map((it) => (it.note ? `${it.h2} | ${it.note}` : it.h2)).join("\n");
}

// ---------------------------------------------------------------------------
// Fact-sheet editor
// ---------------------------------------------------------------------------

const LIST_FIELDS = [
  ["training_support", "Training & Support (one per line)"],
  ["process_steps", "Process Steps (one per line)"],
  ["differentiators", "Differentiators (one per line)"],
  ["proof_points", "Proof Points (one per line)"],
] as const;

/** The list-field keys as a union type, derived from the tuple above. */
type ListFieldKey = (typeof LIST_FIELDS)[number][0];

/** Build a fresh listDrafts record from a fact sheet (seed on load / scrape-done). */
function seedListDrafts(s: FranchiseFactSheet): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const [field] of LIST_FIELDS) {
    drafts[field] = joinLines(s[field as ListFieldKey] as string[] | undefined);
  }
  return drafts;
}

interface FactSheetEditorProps {
  sheet: FranchiseFactSheet;
  onChange: (sheet: FranchiseFactSheet) => void;
  listDrafts: Record<string, string>;
  onListDraftChange: (field: string, raw: string) => void;
}

function FactSheetEditor({ sheet, onChange, listDrafts, onListDraftChange }: FactSheetEditorProps) {
  function set<K extends keyof FranchiseFactSheet>(key: K, value: FranchiseFactSheet[K]) {
    onChange({ ...sheet, [key]: value });
  }

  const labelCls = "block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-1.5";
  const inputCls =
    "w-full h-[42px] border-[1.5px] border-line rounded-lg bg-white text-ink px-3 text-[13px] outline-none transition-colors focus:border-ink";
  const textareaCls =
    "w-full border-[1.5px] border-line rounded-lg bg-white text-ink px-3 py-2.5 text-[13px] leading-[1.6] outline-none focus:border-ink transition-colors resize-y";

  return (
    <div className="space-y-4">
      {/* Financials row */}
      <div className="grid grid-cols-3 gap-3 max-[700px]:grid-cols-1">
        <div>
          <label className={labelCls}>Investment Min ($)</label>
          <input
            type="number"
            value={sheet.investment_min ?? ""}
            onChange={(e) =>
              set("investment_min", e.target.value === "" ? null : Number(e.target.value))
            }
            className={inputCls}
            placeholder="150000"
          />
        </div>
        <div>
          <label className={labelCls}>Investment Max ($)</label>
          <input
            type="number"
            value={sheet.investment_max ?? ""}
            onChange={(e) =>
              set("investment_max", e.target.value === "" ? null : Number(e.target.value))
            }
            className={inputCls}
            placeholder="300000"
          />
        </div>
        <div>
          <label className={labelCls}>Franchise Fee ($)</label>
          <input
            type="number"
            value={sheet.franchise_fee ?? ""}
            onChange={(e) =>
              set("franchise_fee", e.target.value === "" ? null : Number(e.target.value))
            }
            className={inputCls}
            placeholder="45000"
          />
        </div>
      </div>

      {/* Rates row */}
      <div className="grid grid-cols-3 gap-3 max-[700px]:grid-cols-1">
        <div>
          <label className={labelCls}>Royalty %</label>
          <input
            type="text"
            value={sheet.royalty_pct ?? ""}
            onChange={(e) => set("royalty_pct", e.target.value || null)}
            className={inputCls}
            placeholder="6%"
          />
        </div>
        <div>
          <label className={labelCls}>Ad Fund %</label>
          <input
            type="text"
            value={sheet.ad_fund_pct ?? ""}
            onChange={(e) => set("ad_fund_pct", e.target.value || null)}
            className={inputCls}
            placeholder="2%"
          />
        </div>
        <div>
          <label className={labelCls}>Territory Model</label>
          <input
            type="text"
            value={sheet.territory_model ?? ""}
            onChange={(e) => set("territory_model", e.target.value || null)}
            className={inputCls}
            placeholder="Protected territory"
          />
        </div>
      </div>

      {/* Ideal candidate */}
      <div>
        <label className={labelCls}>Ideal Candidate</label>
        <textarea
          value={sheet.ideal_candidate ?? ""}
          onChange={(e) => set("ideal_candidate", e.target.value || null)}
          rows={2}
          className={textareaCls}
          placeholder="Describe the ideal franchisee..."
        />
      </div>

      {/* List fields — bound to raw draft strings so Enter / trailing spaces are preserved */}
      {LIST_FIELDS.map(([field, label]) => (
        <div key={field}>
          <label className={labelCls}>{label}</label>
          <textarea
            value={listDrafts[field] ?? ""}
            onChange={(e) => onListDraftChange(field, e.target.value)}
            rows={3}
            className={textareaCls}
            placeholder="One item per line"
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scrape card
// ---------------------------------------------------------------------------

interface ScrapeCardProps {
  brandId: string;
  isRescrape: boolean;
  onDone: (sheet: FranchiseFactSheet, errors: string[]) => void;
}

function ScrapeCard({ brandId, isRescrape, onDone }: ScrapeCardProps) {
  const [urlsRaw, setUrlsRaw] = useState("");
  const [scraping, setScraping] = useState(false);
  const [error, setScrapeError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  async function handleScrape() {
    const urls = splitLines(urlsRaw);
    if (!urls.length) {
      setScrapeError("Enter at least one URL.");
      return;
    }
    setScraping(true);
    setScrapeError(null);

    let jobId: string;
    try {
      const res = await apiFetchOk("/api/franchise/scrape", {
        method: "POST",
        body: JSON.stringify({ brand_id: brandId, urls }),
      });
      const data = await res.json();
      jobId = data.job_id;
    } catch (err: unknown) {
      setScraping(false);
      setScrapeError(err instanceof Error ? err.message : "Failed to start scrape.");
      return;
    }

    // Poll for completion
    stopPolling();
    let failures = 0;
    const startedAt = Date.now();

    pollRef.current = setInterval(async () => {
      // Hard cap
      if (Date.now() - startedAt > MAX_POLL_DURATION_MS) {
        stopPolling();
        setScraping(false);
        setScrapeError("Scrape appears stuck. It has been running for over 10 minutes.");
        return;
      }

      try {
        const res = await apiFetch(`/api/franchise/scrape/status/${jobId}`);

        if (!res.ok) {
          // 500 = real job failure (e.g. "All scrapes failed: …")
          // 404 = job unknown / already cleaned up (backend includes a restart hint)
          // Surface the backend's detail message immediately for these — no retry.
          if (res.status === 500 || res.status === 404) {
            const errData = await res.json().catch(() => ({
              detail: `Scrape job failed (${res.status})`,
            }));
            stopPolling();
            setScraping(false);
            setScrapeError(errData.detail || `Scrape job failed (${res.status})`);
            return;
          }
          // Other unexpected statuses — count as a transient failure.
          failures += 1;
          if (failures >= MAX_POLL_FAILURES) {
            stopPolling();
            setScraping(false);
            setScrapeError("Lost connection while checking scrape status.");
          }
          return;
        }

        failures = 0;
        const data = await res.json();

        if (data.status === "done") {
          stopPolling();
          setScraping(false);
          onDone(data.fact_sheet as FranchiseFactSheet, (data.scrape_errors as string[]) ?? []);
        }
        // status === "pending" — keep waiting
      } catch {
        // Genuine network error (fetch threw) — count as transient failure.
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) {
          stopPolling();
          setScraping(false);
          setScrapeError("Lost connection while checking scrape status.");
        }
      }
    }, POLL_INTERVAL_MS);
  }

  return (
    <div className="border-[1.5px] border-line rounded-[14px] bg-white p-5 space-y-4">
      {isRescrape && (
        <p className="text-[12px] text-ink-70">
          Scraping new URLs and saving will overwrite the current fact sheet.
        </p>
      )}
      <div>
        <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-1.5">
          Franchise page URLs (one per line)
        </label>
        <textarea
          value={urlsRaw}
          onChange={(e) => setUrlsRaw(e.target.value)}
          rows={4}
          className="w-full border-[1.5px] border-line rounded-lg bg-white text-ink px-3 py-2.5 text-[13px] leading-[1.6] outline-none focus:border-ink transition-colors resize-y font-mono"
          placeholder="https://example.com/franchise&#10;https://example.com/franchise/investment"
          disabled={scraping}
        />
      </div>
      {error && (
        <div className="border-[1.5px] border-[#b91c1c] rounded-[14px] px-4 py-2.5 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
          {error}
        </div>
      )}
      <Button variant="ink" onClick={handleScrape} disabled={scraping}>
        {scraping ? (
          <>
            Scraping
            <span className="inline-block animate-[ellipsis_1.5s_steps(4,end)_infinite] w-[1.5em] text-left">...</span>
          </>
        ) : (
          "Scrape & extract"
        )}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Plan Section
// ---------------------------------------------------------------------------

const TIER_ORDER = ["now", "next", "later"] as const;
const TIER_LABELS: Record<string, string> = { now: "Now", next: "Next", later: "Later" };

interface ContentPlanSectionProps {
  brandId: string;
  hasFactSheet: boolean;
  onGenerateFromPlan: (page: PlanPage) => void;
  /** Set by parent after a plan-page generation is saved to history. */
  planPageUpdate: { pageId: string; generationId: string | null } | null;
  /** Parent calls this after ContentPlanSection has consumed the update. */
  onPlanPageUpdateApplied: () => void;
}

function ContentPlanSection({
  brandId,
  hasFactSheet,
  onGenerateFromPlan,
  planPageUpdate,
  onPlanPageUpdateApplied,
}: ContentPlanSectionProps) {
  // Loaded plan (null = no plan saved yet, undefined = still loading initial fetch)
  const [plan, setPlan] = useState<FranchiseContentPlan | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Build form state
  const [siteUrlsRaw, setSiteUrlsRaw] = useState("");
  const [seedKeywordsRaw, setSeedKeywordsRaw] = useState("");

  // Plan build job state
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildStage, setBuildStage] = useState("");
  const [buildElapsedMs, setBuildElapsedMs] = useState(0);
  const buildStartRef = useRef<number>(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rebuild notice
  const [showRebuildNotice, setShowRebuildNotice] = useState(false);

  // Dirty / save state
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSavePlanError] = useState<string | null>(null);

  // Expand state: set of page IDs that are expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Per-page editable title drafts: pageId -> title string
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});

  // Per-page outline drafts: pageId -> raw textarea string
  const [outlineDrafts, setOutlineDrafts] = useState<Record<string, string>>({});

  // "Built, unsaved" notice
  const [justBuilt, setJustBuilt] = useState(false);

  // React to parent signalling that a plan-page generation was saved to history.
  // Flip the page's status + generation_id in local plan state, then PUT the plan.
  useEffect(() => {
    if (!planPageUpdate || !plan) return;
    const { pageId, generationId } = planPageUpdate;
    // Flush drafts so edits made while generation streamed survive the reseed.
    const flushed = flushDraftsToPlan(plan);
    const updatedPlan: FranchiseContentPlan = {
      ...flushed,
      pages: flushed.pages.map((p) =>
        p.id === pageId
          ? { ...p, status: "generated" as const, generation_id: generationId }
          : p
      ),
    };
    setPlan(updatedPlan);
    // Fire-and-forget PUT — surface errors via the existing save banner if it fails
    savePlan(updatedPlan);
    onPlanPageUpdateApplied();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planPageUpdate]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function stopElapsedTimer() {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }

  // Cleanup on unmount
  useEffect(() => () => {
    stopPolling();
    stopElapsedTimer();
  }, []);

  // Load plan on mount / brand change
  useEffect(() => {
    if (!brandId) return;
    setLoadError(null);
    setPlan(undefined); // loading
    apiFetch(`/api/franchise/plan/${brandId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load content plan (${res.status})`);
        const data = await res.json();
        setPlan(data.franchise_content_plan ?? null);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load content plan.");
        setPlan(null);
      });
  }, [brandId]);

  // Seed drafts when plan loads
  useEffect(() => {
    if (!plan) return;
    const titles: Record<string, string> = {};
    const outlines: Record<string, string> = {};
    for (const p of plan.pages) {
      titles[p.id] = p.title;
      outlines[p.id] = serializeOutlineItems(p.outline ?? []);
    }
    setTitleDrafts(titles);
    setOutlineDrafts(outlines);
  }, [plan]);

  async function handleBuildPlan() {
    const siteUrls = splitLines(siteUrlsRaw);
    if (!siteUrls.length) {
      setBuildError("Enter at least one site URL.");
      return;
    }
    if (siteUrls.length > 5) {
      setBuildError("Maximum 5 site URLs.");
      return;
    }
    const seedKeywords = seedKeywordsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    setBuilding(true);
    setBuildError(null);
    setBuildStage("Starting");
    setBuildElapsedMs(0);
    buildStartRef.current = Date.now();

    // Start elapsed ticker
    stopElapsedTimer();
    elapsedTimerRef.current = setInterval(() => {
      setBuildElapsedMs(Date.now() - buildStartRef.current);
    }, 1000);

    let jobId: string;
    try {
      const res = await apiFetchOk("/api/franchise/plan", {
        method: "POST",
        body: JSON.stringify({ brand_id: brandId, site_urls: siteUrls, seed_keywords: seedKeywords }),
      });
      const data = await res.json();
      jobId = data.job_id;
    } catch (err: unknown) {
      setBuilding(false);
      stopElapsedTimer();
      setBuildError(err instanceof Error ? err.message : "Failed to start plan build.");
      return;
    }

    // Poll for completion
    stopPolling();
    let failures = 0;

    pollRef.current = setInterval(async () => {
      // Hard cap — 15 minutes for plan
      if (Date.now() - buildStartRef.current > MAX_PLAN_POLL_DURATION_MS) {
        stopPolling();
        stopElapsedTimer();
        setBuilding(false);
        setBuildError("Plan build appears stuck. It has been running for over 15 minutes.");
        return;
      }

      try {
        const res = await apiFetch(`/api/franchise/plan/status/${jobId}`);

        if (!res.ok) {
          // 500 / 404 — surface detail immediately, stop polling
          if (res.status === 500 || res.status === 404) {
            const errData = await res.json().catch(() => ({
              detail: `Plan job failed (${res.status})`,
            }));
            stopPolling();
            stopElapsedTimer();
            setBuilding(false);
            setBuildError(errData.detail || `Plan job failed (${res.status})`);
            return;
          }
          // Other unexpected statuses — transient failure
          failures += 1;
          if (failures >= MAX_POLL_FAILURES) {
            stopPolling();
            stopElapsedTimer();
            setBuilding(false);
            setBuildError("Lost connection while checking plan status.");
          }
          return;
        }

        failures = 0;
        const data = await res.json();

        if (data.status === "done") {
          stopPolling();
          stopElapsedTimer();
          setBuilding(false);
          const newPlan = data.plan as FranchiseContentPlan;
          setPlan(newPlan);
          setDirty(true);
          setJustBuilt(true);
          setShowRebuildNotice(false);
        } else if (data.stage) {
          setBuildStage(data.stage);
        }
        // status === "pending" — keep waiting
      } catch {
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) {
          stopPolling();
          stopElapsedTimer();
          setBuilding(false);
          setBuildError("Lost connection while checking plan status.");
        }
      }
    }, POLL_INTERVAL_MS);
  }

  async function savePlan(planToSave: FranchiseContentPlan): Promise<boolean> {
    setSaveStatus("saving");
    setSavePlanError(null);
    try {
      await apiFetchOk(`/api/franchise/plan/${brandId}`, {
        method: "PUT",
        body: JSON.stringify({ franchise_content_plan: planToSave }),
      });
      setSaveStatus("saved");
      setDirty(false);
      setJustBuilt(false);
      setTimeout(() => setSaveStatus("idle"), 2500);
      return true;
    } catch (err: unknown) {
      setSaveStatus("error");
      setSavePlanError(err instanceof Error ? err.message : "Failed to save plan. Try again.");
      return false;
    }
  }

  function flushDraftsToPlan(currentPlan: FranchiseContentPlan): FranchiseContentPlan {
    return {
      ...currentPlan,
      pages: currentPlan.pages.map((p) => ({
        ...p,
        title: titleDrafts[p.id] ?? p.title,
        outline: parseOutlineLines(outlineDrafts[p.id] ?? serializeOutlineItems(p.outline ?? [])),
      })),
    };
  }

  async function handleSavePlan() {
    if (!plan) return;
    const flushed = flushDraftsToPlan(plan);
    setPlan(flushed);
    await savePlan(flushed);
  }

  function handleDeletePage(pageId: string) {
    if (!plan) return;
    // Flush drafts first so the plan-driven draft reseed can't revert
    // in-progress edits on other rows.
    const flushed = flushDraftsToPlan(plan);
    const updated = { ...flushed, pages: flushed.pages.filter((p) => p.id !== pageId) };
    setPlan(updated);
    setDirty(true);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(pageId);
      return next;
    });
  }

  async function handleGenerateFromPlan(page: PlanPage) {
    if (!plan) return;
    // If dirty, flush + save first
    if (dirty) {
      const flushed = flushDraftsToPlan(plan);
      setPlan(flushed);
      const ok = await savePlan(flushed);
      if (!ok) return; // error already surfaced
    }
    onGenerateFromPlan(page);
  }

  // ---------------------------------------------------------------------------
  // Shared style constants
  // ---------------------------------------------------------------------------
  const labelCls = "block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-1.5";
  const inputCls =
    "w-full h-[42px] border-[1.5px] border-line rounded-lg bg-white text-ink px-3 text-[13px] outline-none transition-colors focus:border-ink";
  const textareaCls =
    "w-full border-[1.5px] border-line rounded-lg bg-white text-ink px-3 py-2.5 text-[13px] leading-[1.6] outline-none focus:border-ink transition-colors resize-y";

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (plan === undefined) {
    return (
      <div className="border-[1.5px] border-line rounded-[18px] p-5">
        <div className="text-[13px] text-ink-40">Loading content plan...</div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state — no plan yet (or "Rebuild" clicked)
  // ---------------------------------------------------------------------------
  const showBuildForm = plan === null || showRebuildNotice;

  if (showBuildForm) {
    const isDisabled = !hasFactSheet || building;
    return (
      <div className="border-[1.5px] border-line rounded-[18px] p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40">
            Content Plan
          </div>
          {plan !== null && (
            <Button
              variant="light"
              size="sm"
              onClick={() => setShowRebuildNotice(false)}
            >
              Cancel rebuild
            </Button>
          )}
        </div>

        {showRebuildNotice && (
          <div className="border-[1.5px] border-[#d97706] rounded-[14px] px-4 py-2.5 text-[13px] text-[#d97706] bg-[rgba(217,119,6,0.05)]">
            Saving the new plan will overwrite the current one.
          </div>
        )}

        {!hasFactSheet && (
          <div className="text-[13px] text-ink-70 bg-[#F3F1ED] rounded-[10px] px-4 py-3">
            Save a fact sheet first — the plan builder uses it for brand context.
          </div>
        )}

        {loadError && (
          <div className="border-[1.5px] border-[#b91c1c] rounded-[14px] px-4 py-2.5 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
            {loadError}
          </div>
        )}

        <div>
          <label className={labelCls}>Site URLs to analyze (1-5, one per line)</label>
          <textarea
            value={siteUrlsRaw}
            onChange={(e) => setSiteUrlsRaw(e.target.value)}
            rows={3}
            className={`${textareaCls} font-mono`}
            placeholder={"https://example.com/franchise\nhttps://example.com/why-franchise"}
            disabled={isDisabled}
          />
        </div>

        <div>
          <label className={labelCls}>Seed keywords (comma-separated, optional, max 20)</label>
          <input
            type="text"
            value={seedKeywordsRaw}
            onChange={(e) => setSeedKeywordsRaw(e.target.value)}
            className={inputCls}
            placeholder="franchise opportunity, low cost franchise, food franchise"
            disabled={isDisabled}
          />
        </div>

        {buildError && (
          <div className="border-[1.5px] border-[#b91c1c] rounded-[14px] px-4 py-2.5 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
            {buildError}
          </div>
        )}

        {building && (
          <div className="flex items-center gap-3 text-[13px] text-ink-70">
            <span className="inline-block w-[6px] h-[6px] rounded-full bg-ink-40 animate-pulse" />
            <span>{buildStage}</span>
            <span className="text-ink-40 font-mono text-[11px]">
              {formatElapsed(buildElapsedMs)}
            </span>
          </div>
        )}

        <Button
          variant="ink"
          onClick={handleBuildPlan}
          disabled={isDisabled}
        >
          {building ? (
            <>
              Building plan
              <span className="inline-block animate-[ellipsis_1.5s_steps(4,end)_infinite] w-[1.5em] text-left">
                ...
              </span>
            </>
          ) : (
            "Build content plan"
          )}
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Loaded plan state
  // ---------------------------------------------------------------------------
  const pagesByTier: Record<string, PlanPage[]> = { now: [], next: [], later: [] };
  for (const p of plan.pages) {
    if (p.tier in pagesByTier) pagesByTier[p.tier].push(p);
  }

  // Build a quick lookup: page id -> title (for pillar links)
  const pageIndex = Object.fromEntries(plan.pages.map((p) => [p.id, p]));

  return (
    <div className="border-[1.5px] border-line rounded-[18px] p-5 space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40">Content Plan</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="light"
            size="sm"
            onClick={() => {
              setShowRebuildNotice(true);
              setSiteUrlsRaw("");
              setSeedKeywordsRaw("");
              setBuildError(null);
            }}
          >
            Rebuild plan
          </Button>
          <Button
            variant="ink"
            size="sm"
            onClick={handleSavePlan}
            disabled={saveStatus === "saving" || (!dirty && saveStatus !== "error")}
          >
            {saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "saved"
              ? "Saved"
              : "Save plan"}
          </Button>
        </div>
      </div>

      {/* Just-built notice */}
      {justBuilt && (
        <div className="border-[1.5px] border-[#d97706] rounded-[14px] px-4 py-2.5 text-[13px] text-[#d97706] bg-[rgba(217,119,6,0.05)]">
          Plan built - review and save it.
        </div>
      )}

      {/* Save error */}
      {saveStatus === "error" && saveError && (
        <div className="border-[1.5px] border-[#b91c1c] rounded-[14px] px-4 py-2.5 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
          {saveError}
        </div>
      )}

      {/* Plan meta */}
      <div className="text-[11px] text-ink-40 font-mono">
        Generated {new Date(plan.generated_at).toLocaleDateString()} &middot;{" "}
        {plan.pages.length} pages &middot; {plan.clusters.length} clusters
      </div>

      {/* Tiers */}
      {TIER_ORDER.map((tier) => {
        const pages = pagesByTier[tier];
        if (!pages.length) return null;
        return (
          <div key={tier} className="space-y-2">
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70 pt-1">
              {TIER_LABELS[tier]}
            </div>
            <div className="space-y-2">
              {pages.map((page) => {
                const isExpanded = expandedIds.has(page.id);
                const topKw: PlanKeyword | undefined = page.target_keywords?.[0];

                return (
                  <div
                    key={page.id}
                    className="border-[1.5px] border-line rounded-[12px] bg-white overflow-hidden"
                  >
                    {/* Row */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#F3F1ED] transition-colors"
                      onClick={() =>
                        setExpandedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(page.id)) next.delete(page.id);
                          else next.add(page.id);
                          return next;
                        })
                      }
                    >
                      {/* Toggle indicator */}
                      <span className="text-ink-40 text-[11px] select-none w-[12px]">
                        {isExpanded ? "▾" : "▸"}
                      </span>

                      {/* Title */}
                      <span className="text-[13px] text-ink font-medium flex-1 min-w-0 truncate">
                        {titleDrafts[page.id] ?? page.title}
                      </span>

                      {/* Format pill */}
                      <span className="text-[10px] tracking-[0.15em] uppercase text-ink-70 bg-[#F3F1ED] rounded-full px-2 py-0.5 shrink-0 hidden sm:block">
                        {page.format}
                      </span>

                      {/* Top keyword */}
                      {topKw && (
                        <span className="text-[11px] font-mono text-ink-40 shrink-0 hidden md:block">
                          {topKw.kw}{" "}
                          <span className="text-ink-40">({topKw.volume.toLocaleString()})</span>
                        </span>
                      )}

                      {/* Status chip */}
                      <span
                        className={`text-[10px] tracking-[0.15em] uppercase rounded-full px-2 py-0.5 shrink-0 ${
                          page.status === "generated"
                            ? "bg-[rgba(21,128,61,0.1)] text-[#15803d]"
                            : "bg-[#F3F1ED] text-ink-40"
                        }`}
                      >
                        {page.status}
                      </span>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-line px-4 py-4 space-y-4">
                        {/* Editable title */}
                        <div>
                          <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-1.5">
                            Title
                          </label>
                          <input
                            type="text"
                            value={titleDrafts[page.id] ?? page.title}
                            onChange={(e) => {
                              setTitleDrafts((prev) => ({ ...prev, [page.id]: e.target.value }));
                              setDirty(true);
                            }}
                            className={inputCls}
                          />
                        </div>

                        {/* Keywords */}
                        {page.target_keywords?.length > 0 && (
                          <div>
                            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-1.5">
                              Target Keywords
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {page.target_keywords.map((kw, i) => (
                                <span
                                  key={i}
                                  className="text-[11px] font-mono bg-[#F3F1ED] rounded-full px-2.5 py-1 text-ink-70"
                                >
                                  {kw.kw}{" "}
                                  <span className="text-ink-40">
                                    {kw.volume.toLocaleString()}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Intent */}
                        {page.intent && (
                          <div>
                            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-1">
                              Intent
                            </div>
                            <div className="text-[12px] text-ink-70">{page.intent}</div>
                          </div>
                        )}

                        {/* Rationale */}
                        {page.rationale && (
                          <div>
                            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-1">
                              Rationale
                            </div>
                            <div className="text-[12px] text-ink-70">{page.rationale}</div>
                          </div>
                        )}

                        {/* SERP notes */}
                        {page.serp_notes && (
                          <div>
                            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-1">
                              SERP Notes
                            </div>
                            <div className="text-[12px] text-ink-70">{page.serp_notes}</div>
                          </div>
                        )}

                        {/* Pillar link */}
                        {page.pillar_id && pageIndex[page.pillar_id] && (
                          <div>
                            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-1">
                              Pillar Page
                            </div>
                            <div className="text-[12px] text-ink-70">
                              {pageIndex[page.pillar_id].title}
                            </div>
                          </div>
                        )}

                        {/* Editable outline */}
                        <div>
                          <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-1.5">
                            Outline (one section per line: H2 | note)
                          </label>
                          <textarea
                            value={outlineDrafts[page.id] ?? ""}
                            onChange={(e) => {
                              setOutlineDrafts((prev) => ({
                                ...prev,
                                [page.id]: e.target.value,
                              }));
                              setDirty(true);
                            }}
                            rows={4}
                            className={textareaCls}
                            placeholder={"Why Franchise With Us | overview of key benefits\nInvestment Breakdown | FDD numbers"}
                          />
                        </div>

                        {/* Row actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="ink"
                            size="sm"
                            onClick={() => handleGenerateFromPlan(page)}
                          >
                            Generate
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePage(page.id)}
                          >
                            Delete row
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page (inner component — no useSearchParams, no Suspense needed)
// ---------------------------------------------------------------------------

function FranchisePageInner() {
  // Brand list
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [brandsError, setBrandsError] = useState<string | null>(null);

  // Profile / fact sheet state
  const [sheet, setSheet] = useState<FranchiseFactSheet | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Raw textarea drafts for list fields — keeps Enter / trailing spaces alive
  // until Save, where splitLines is applied to build the PUT payload.
  const [listDrafts, setListDrafts] = useState<Record<string, string>>({});

  function handleListDraftChange(field: string, raw: string) {
    setListDrafts((prev) => ({ ...prev, [field]: raw }));
  }

  // Scrape UI
  const [showScrapeCard, setShowScrapeCard] = useState(false);
  const [isRescrape, setIsRescrape] = useState(false);
  const [scrapeWarnings, setScrapeWarnings] = useState<string[]>([]);

  // Save state
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Generation
  const { output, setOutput, isGenerating, error: genError, usage, generate, abort } =
    useGeneration();
  const [activePageType, setActivePageType] = useState<string | null>(null);
  const [activePlanPage, setActivePlanPage] = useState<PlanPage | null>(null);
  const [saveHistoryStatus, setSaveHistoryStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [saveHistoryError, setSaveHistoryError] = useState<string | null>(null);

  // Plan page update callback ref — set by ContentPlanSection via a shared callback
  // We need a way for the parent to update a plan page's status after save-to-history.
  // We accomplish this by keeping plan page update state here and passing a callback down.
  const [planPageUpdate, setPlanPageUpdate] = useState<{
    pageId: string;
    generationId: string | null;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Load brands on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function loadBrands() {
      try {
        const res = await apiFetch("/api/brands");
        if (!res.ok) throw new Error(`Failed to load brands (${res.status})`);
        const data: Brand[] = await res.json();
        setBrands(data);
        if (data.length > 0) setBrandId(data[0].id);
      } catch (err: unknown) {
        setBrandsError(
          err instanceof Error ? err.message : "Failed to load brands. Refresh the page to try again."
        );
      }
    }
    loadBrands();
  }, []);

  // ---------------------------------------------------------------------------
  // Load profile when brand changes
  // ---------------------------------------------------------------------------
  const loadProfile = useCallback(
    async (id: string) => {
      if (!id) return;
      setProfileLoading(true);
      setProfileError(null);
      setSheet(null);
      setShowScrapeCard(false);
      setIsRescrape(false);
      setScrapeWarnings([]);
      setOutput("");
      setActivePageType(null);
      setActivePlanPage(null);

      try {
        const res = await apiFetch(`/api/franchise/profile/${id}`);
        if (!res.ok) throw new Error(`Failed to load franchise profile (${res.status})`);
        const data = await res.json();
        if (data.franchise_profile) {
          const loaded = data.franchise_profile as FranchiseFactSheet;
          setSheet(loaded);
          setListDrafts(seedListDrafts(loaded));
        } else {
          // No sheet yet — show the scrape card
          setShowScrapeCard(true);
        }
      } catch (err: unknown) {
        setProfileError(
          err instanceof Error
            ? err.message
            : "Failed to load franchise profile. Refresh the page to try again."
        );
      } finally {
        setProfileLoading(false);
      }
    },
    [setOutput]
  );

  useEffect(() => {
    if (brandId) loadProfile(brandId);
  }, [brandId, loadProfile]);

  // ---------------------------------------------------------------------------
  // Scrape done handler
  // ---------------------------------------------------------------------------
  function handleScrapeDone(newSheet: FranchiseFactSheet, errors: string[]) {
    setSheet(newSheet);
    setListDrafts(seedListDrafts(newSheet));
    setShowScrapeCard(false);
    setIsRescrape(false);
    setScrapeWarnings(errors);
    // Don't auto-save — user must click "Save fact sheet"
    setSaveStatus("idle");
  }

  // ---------------------------------------------------------------------------
  // Save fact sheet
  // ---------------------------------------------------------------------------
  async function saveSheet() {
    if (!sheet || !brandId) return;
    setSaveStatus("saving");
    setSaveError(null);

    // Flush raw list drafts → parsed arrays into the sheet before saving.
    const flushedSheet: FranchiseFactSheet = {
      ...sheet,
      ...Object.fromEntries(
        LIST_FIELDS.map(([field]) => [field, splitLines(listDrafts[field] ?? "")])
      ),
    };
    // Keep sheet state in sync with what we're persisting.
    setSheet(flushedSheet);

    try {
      await apiFetchOk(`/api/franchise/profile/${brandId}`, {
        method: "PUT",
        body: JSON.stringify({ franchise_profile: flushedSheet }),
      });
      setSaveStatus("saved");
      // Reset to idle after a moment
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err: unknown) {
      setSaveStatus("error");
      setSaveError(
        err instanceof Error ? err.message : "Failed to save fact sheet. Try again."
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Generate (page-type button path)
  // ---------------------------------------------------------------------------
  function handleGenerate(pageTypeKey: string) {
    setActivePageType(pageTypeKey);
    setActivePlanPage(null);
    setOutput("");
    setSaveHistoryStatus("idle");
    setSaveHistoryError(null);
    const payload: FranchiseGeneratePayload = { brand_id: brandId, page_type: pageTypeKey };
    generate("/api/franchise/generate", payload);
  }

  // ---------------------------------------------------------------------------
  // Generate from plan page
  // ---------------------------------------------------------------------------
  function handleGenerateFromPlan(page: PlanPage) {
    setActivePlanPage(page);
    setActivePageType(null);
    setOutput("");
    setSaveHistoryStatus("idle");
    setSaveHistoryError(null);
    const payload: FranchiseGeneratePayload = { brand_id: brandId, plan_page_id: page.id };
    generate("/api/franchise/generate", payload);
    // Scroll to generation card
    setTimeout(() => {
      document.getElementById("franchise-generate-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  // ---------------------------------------------------------------------------
  // Save to history
  // ---------------------------------------------------------------------------
  async function saveToHistory() {
    if (!output || !brandId) return;

    const isPlanGeneration = activePlanPage !== null;

    const keyword = isPlanGeneration
      ? activePlanPage!.title
      : (FRANCHISE_PAGE_TYPES.find((t) => t.key === activePageType)?.label ?? activePageType ?? "");

    const contentType = isPlanGeneration ? "franchise_plan_page" : (activePageType ?? "");

    setSaveHistoryStatus("saving");
    setSaveHistoryError(null);
    try {
      const res = await apiFetchOk("/api/generations", {
        method: "POST",
        body: JSON.stringify({
          brand_id: brandId,
          keyword,
          city: "",
          content: output,
          content_type: contentType,
          word_count: output.split(/\s+/).filter(Boolean).length,
          input_tokens: usage?.input_tokens ?? 0,
          output_tokens: usage?.output_tokens ?? 0,
        }),
      });

      // POST /api/generations returns the inserted row (result.data[0]) with its id
      const savedRow = await res.json();
      setSaveHistoryStatus("saved");

      // If this was a plan-page generation, flip status + store generation_id on the plan
      if (isPlanGeneration && activePlanPage) {
        setPlanPageUpdate({
          pageId: activePlanPage.id,
          generationId: savedRow?.id ?? null,
        });
        setActivePlanPage(null);
      }
    } catch (err: unknown) {
      setSaveHistoryStatus("error");
      setSaveHistoryError(
        err instanceof Error ? err.message : "Failed to save to history. Try again."
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const hasSheet = sheet !== null;

  // Output panel label
  const outputLabel = activePlanPage
    ? activePlanPage.title
    : (FRANCHISE_PAGE_TYPES.find((t) => t.key === activePageType)?.label ?? "Output");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display font-[800] text-[clamp(32px,4vw,56px)] leading-[0.95] tracking-[-0.035em] m-0">
          Franchise
        </h1>
        <p className="text-[13px] text-ink-70 mt-2">
          Scrape your franchise facts, edit the sheet, then generate recruitment pages.
        </p>
      </div>

      {/* Brand error */}
      {brandsError && (
        <div className="border-[1.5px] border-[#b91c1c] rounded-[14px] px-5 py-3 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
          {brandsError}
        </div>
      )}

      {/* Brand select */}
      {brands.length > 0 && (
        <div>
          <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">
            Brand
          </label>
          <select
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
            }}
            className="w-full h-[46px] border-[1.5px] border-line rounded-lg bg-white text-ink px-3 font-mono text-[13px] outline-none transition-shadow duration-150 focus:border-ink appearance-none cursor-pointer"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Profile loading */}
      {profileLoading && (
        <div className="text-[13px] text-ink-40">Loading franchise profile...</div>
      )}

      {/* Profile error */}
      {profileError && (
        <div className="border-[1.5px] border-[#b91c1c] rounded-[14px] px-5 py-3 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
          {profileError}
        </div>
      )}

      {/* Scrape warnings */}
      {scrapeWarnings.length > 0 && (
        <div className="border-[1.5px] border-[#d97706] rounded-[14px] px-5 py-3 bg-[rgba(217,119,6,0.05)] space-y-1">
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#d97706]">
            Scrape warnings
          </div>
          {scrapeWarnings.map((w, i) => (
            <div key={i} className="text-[12px] text-[#d97706]">
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Scrape card */}
      {showScrapeCard && brandId && (
        <ScrapeCard brandId={brandId} isRescrape={isRescrape} onDone={handleScrapeDone} />
      )}

      {/* Fact sheet editor */}
      {hasSheet && !profileLoading && (
        <div className="border-[1.5px] border-line rounded-[18px] p-5 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40">
              Franchise Fact Sheet
            </div>
            {!showScrapeCard && (
              <Button
                variant="light"
                size="sm"
                onClick={() => {
                  setShowScrapeCard(true);
                  setIsRescrape(true);
                  setScrapeWarnings([]);
                }}
              >
                Re-scrape
              </Button>
            )}
          </div>

          <FactSheetEditor
            sheet={sheet}
            onChange={setSheet}
            listDrafts={listDrafts}
            onListDraftChange={handleListDraftChange}
          />

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="ink"
              onClick={saveSheet}
              disabled={saveStatus === "saving"}
            >
              {saveStatus === "saving"
                ? "Saving..."
                : saveStatus === "saved"
                ? "Saved"
                : "Save fact sheet"}
            </Button>
            {saveStatus === "error" && saveError && (
              <span className="text-[12px] text-[#b91c1c]">{saveError}</span>
            )}
          </div>
        </div>
      )}

      {/* Content plan section — between fact sheet and generation card */}
      {hasSheet && !profileLoading && brandId && (
        <ContentPlanSection
          brandId={brandId}
          hasFactSheet={hasSheet}
          onGenerateFromPlan={handleGenerateFromPlan}
          planPageUpdate={planPageUpdate}
          onPlanPageUpdateApplied={() => setPlanPageUpdate(null)}
        />
      )}

      {/* Generation card */}
      {hasSheet && !profileLoading && (
        <div id="franchise-generate-card" className="border-[1.5px] border-line rounded-[18px] p-5 space-y-4">
          <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40">
            Generate Page
          </div>

          {/* Plan-page mode: show banner instead of buttons */}
          {activePlanPage ? (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 text-[13px] text-ink-70 bg-[#F3F1ED] rounded-[10px] px-4 py-2.5">
                Generating from plan:{" "}
                <span className="font-medium text-ink">{activePlanPage.title}</span>
              </div>
              {isGenerating && (
                <Button variant="light" size="sm" onClick={abort}>
                  Stop
                </Button>
              )}
              {!isGenerating && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActivePlanPage(null);
                    setOutput("");
                    setSaveHistoryStatus("idle");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          ) : (
            /* Standard page-type buttons */
            <div className="flex gap-2 flex-wrap">
              {FRANCHISE_PAGE_TYPES.map((pt) => (
                <Button
                  key={pt.key}
                  variant={activePageType === pt.key ? "ink" : "ghost"}
                  onClick={() => handleGenerate(pt.key)}
                  disabled={isGenerating}
                >
                  {isGenerating && activePageType === pt.key ? (
                    <>
                      Writing
                      <span className="inline-block animate-[ellipsis_1.5s_steps(4,end)_infinite] w-[1.5em] text-left">
                        ...
                      </span>
                    </>
                  ) : (
                    pt.label
                  )}
                </Button>
              ))}
              {isGenerating && (
                <Button variant="light" size="sm" onClick={abort}>
                  Stop
                </Button>
              )}
            </div>
          )}

          {/* Generating spinner for plan-page mode */}
          {activePlanPage && isGenerating && (
            <div className="text-[12px] text-ink-40 flex items-center gap-2">
              <span className="inline-block w-[5px] h-[5px] rounded-full bg-ink-40 animate-pulse" />
              Writing
              <span className="inline-block animate-[ellipsis_1.5s_steps(4,end)_infinite] w-[1.5em] text-left">
                ...
              </span>
            </div>
          )}

          {/* Generation error */}
          {genError && (
            <div className="border-[1.5px] border-[#b91c1c] rounded-[14px] px-5 py-3 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
              {genError}
            </div>
          )}
        </div>
      )}

      {/* Output panel */}
      {output && (
        <div className="border-[1.5px] border-line rounded-[18px] p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40">
              {outputLabel}
              {isGenerating && (
                <span className="ml-2 inline-block w-[1.5em] text-left animate-[ellipsis_1.5s_steps(4,end)_infinite]">
                  ...
                </span>
              )}
            </div>
            {usage && (
              <div className="text-[10px] tracking-[0.04em] text-ink-40 font-mono">
                {usage.input_tokens.toLocaleString()} in / {usage.output_tokens.toLocaleString()} out
              </div>
            )}
          </div>

          {/* Content display */}
          <div className="text-[13px] text-ink leading-[1.75] whitespace-pre-wrap font-mono bg-[#F3F1ED] rounded-[10px] px-4 py-3 max-h-[600px] overflow-y-auto">
            {output}
            {isGenerating && (
              <span className="inline-block w-[2px] h-[1em] bg-ink align-middle ml-0.5 animate-pulse" />
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap items-center">
            <Button
              variant="light"
              size="sm"
              onClick={() => navigator.clipboard.writeText(output)}
            >
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={saveToHistory}
              disabled={saveHistoryStatus === "saving" || saveHistoryStatus === "saved"}
            >
              {saveHistoryStatus === "saving"
                ? "Saving..."
                : saveHistoryStatus === "saved"
                ? "Saved to history"
                : "Save to history"}
            </Button>
            {saveHistoryStatus === "error" && saveHistoryError && (
              <span className="text-[12px] text-[#b91c1c]">{saveHistoryError}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export — default export required for Next.js App Router
// ---------------------------------------------------------------------------
export default function FranchisePage() {
  return <FranchisePageInner />;
}
