"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch, apiFetchOk } from "@/lib/api";
import {
  type Brand,
  type FranchiseFactSheet,
  type FranchiseGeneratePayload,
  FRANCHISE_PAGE_TYPES,
} from "@/lib/types";
import { Button } from "@/components/shared/Button";
import { useGeneration } from "@/hooks/useGeneration";

// ---------------------------------------------------------------------------
// Polling constants — mirror the pattern from generate/page.tsx
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_FAILURES = 5;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10-minute hard cap

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
  const [saveHistoryStatus, setSaveHistoryStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [saveHistoryError, setSaveHistoryError] = useState<string | null>(null);

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
  // Generate
  // ---------------------------------------------------------------------------
  function handleGenerate(pageTypeKey: string) {
    setActivePageType(pageTypeKey);
    setOutput("");
    setSaveHistoryStatus("idle");
    setSaveHistoryError(null);
    const payload: FranchiseGeneratePayload = { brand_id: brandId, page_type: pageTypeKey };
    generate("/api/franchise/generate", payload);
  }

  // ---------------------------------------------------------------------------
  // Save to history
  // ---------------------------------------------------------------------------
  async function saveToHistory() {
    if (!output || !activePageType || !brandId) return;
    const pageTypeLabel =
      FRANCHISE_PAGE_TYPES.find((t) => t.key === activePageType)?.label ?? activePageType;

    setSaveHistoryStatus("saving");
    setSaveHistoryError(null);
    try {
      await apiFetchOk("/api/generations", {
        method: "POST",
        body: JSON.stringify({
          brand_id: brandId,
          keyword: pageTypeLabel,
          city: "",
          content: output,
          content_type: activePageType,
          word_count: output.split(/\s+/).filter(Boolean).length,
          input_tokens: usage?.input_tokens ?? 0,
          output_tokens: usage?.output_tokens ?? 0,
        }),
      });
      setSaveHistoryStatus("saved");
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

      {/* Generation card */}
      {hasSheet && !profileLoading && (
        <div className="border-[1.5px] border-line rounded-[18px] p-5 space-y-4">
          <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40">
            Generate Page
          </div>
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
              {FRANCHISE_PAGE_TYPES.find((t) => t.key === activePageType)?.label ?? "Output"}
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
