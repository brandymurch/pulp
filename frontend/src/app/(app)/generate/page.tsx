"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/shared/Button";
import { KeywordInput } from "@/components/generate/KeywordInput";
import { TemplateSelector } from "@/components/generate/TemplateSelector";
import { CompetitorInput } from "@/components/generate/CompetitorInput";
import { ContentViewer } from "@/components/generate/ContentViewer";
import { TermHeatmap } from "@/components/generate/TermHeatmap";
import { POPScoreCard } from "@/components/generate/POPScoreCard";

type Phase = "idle" | "pending" | "brief" | "outline" | "generating" | "scoring" | "revising" | "done" | "error";

const phaseLabels: Record<Phase, string> = {
  idle: "Generate",
  pending: "Starting",
  brief: "Analyzing SEO landscape",
  outline: "Building outline",
  generating: "Writing content",
  scoring: "Scoring content",
  revising: "Revising based on SEO feedback",
  done: "Done",
  error: "Error",
};

const phaseDescriptions: Record<Phase, string> = {
  idle: "Enter a keyword and city, select a template, and let the pipeline do the rest.",
  pending: "Starting the content pipeline...",
  brief: "Pulling competitive SERP data and analyzing term targets. This can take up to 2 minutes.",
  outline: "Claude is building a content outline from the SEO data.",
  generating: "Writing content against the SEO brief and your voice settings.",
  scoring: "Running SEO score analysis. This can take a minute.",
  revising: "Revising based on SEO feedback to improve the score.",
  done: "Content is ready. Review, edit, save, or export.",
  error: "Something went wrong.",
};

const activePhases = new Set(["pending", "brief", "outline", "generating", "scoring", "revising"]);

export default function GeneratePage() {
  const searchParams = useSearchParams();
  const urlBrandId = searchParams.get("brand") || "";
  const urlLocationId = searchParams.get("location") || "";

  // Inputs
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [contentType, setContentType] = useState("landing_page");
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([]);
  const [pageSlug, setPageSlug] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  // Brand
  const [brands, setBrands] = useState<any[]>([]);
  const [brandId, setBrandId] = useState("");
  const [brandName, setBrandName] = useState("");

  // Pipeline state
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [content, setContent] = useState("");
  const [brief, setBrief] = useState<any>(null);
  const [outlineData, setOutlineData] = useState<any>(null);
  const [popScore, setPopScore] = useState<any>(null);
  const [revisionCount, setRevisionCount] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [usage, setUsage] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load brands on mount
  useEffect(() => {
    async function loadBrands() {
      try {
        const res = await apiFetch("/api/brands");
        if (res.ok) {
          const data = await res.json();
          setBrands(data);
          const target = urlBrandId ? data.find((b: any) => b.id === urlBrandId) : data[0];
          if (target) {
            setBrandId(target.id);
            setBrandName(target.name);
          }
        }
      } catch {}
    }
    loadBrands();
  }, [urlBrandId]);

  // Check for running pipeline when brand loads
  useEffect(() => {
    if (!brandId) return;
    async function checkRunning() {
      try {
        const res = await apiFetch(`/api/pipeline/list?brand_id=${brandId}&limit=1`);
        if (!res.ok) return;
        const jobs = await res.json();
        if (jobs.length > 0) {
          const latest = jobs[0];
          const activePhasesList = ["pending", "brief", "outline", "generating", "scoring", "revising"];
          if (activePhasesList.includes(latest.phase)) {
            setPipelineId(latest.id);
            setPhase(latest.phase as Phase);
            setKeyword(latest.keyword || "");
            startPolling(latest.id);
          }
        }
      } catch {}
    }
    checkRunning();
  }, [brandId]);

  // Load locations when brand changes
  useEffect(() => {
    if (!brandId) return;
    async function loadLocations() {
      try {
        const res = await apiFetch(`/api/locations?brand_id=${brandId}`);
        if (res.ok) {
          const locs = await res.json();
          setLocations(locs);
          if (urlLocationId) {
            const target = locs.find((l: any) => l.id === urlLocationId);
            if (target) {
              setSelectedLocationId(target.id);
              setCity(target.city);
              setState(target.state);
            }
          }
        }
      } catch {}
    }
    loadLocations();
  }, [brandId, urlLocationId]);

  // Poll pipeline status
  function startPolling(id: string) {
    stopPolling();
    setElapsed(0);
    elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/pipeline/status/${id}`);
        if (!res.ok) return;
        const data = await res.json();

        setPhase(data.phase as Phase);
        if (data.brief) setBrief(data.brief);
        if (data.outline) setOutlineData(data.outline);
        if (data.content) setContent(data.content);
        if (data.score) setPopScore(data.score);
        if (data.revision_count) setRevisionCount(data.revision_count);
        if (data.word_count) setWordCount(data.word_count);
        if (data.input_tokens || data.output_tokens) {
          setUsage({ input_tokens: data.input_tokens, output_tokens: data.output_tokens });
        }
        if (data.error) setError(data.error);

        // Stop polling when done or errored
        if (data.phase === "done" || data.phase === "error") {
          stopPolling();
        }
      } catch {}
    }, 3000);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  }

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  // Start pipeline
  async function startPipeline() {
    setPhase("pending");
    setError(null);
    setContent("");
    setBrief(null);
    setOutlineData(null);
    setPopScore(null);
    setRevisionCount(0);
    setWordCount(0);
    setUsage(null);
    setSaved(false);
    setExportUrl(null);

    try {
      // For city landing pages, auto-derive keyword from brand's primary keyword
      const derivedKeyword = contentType === "landing_page"
        ? `${brands.find(b => b.id === brandId)?.primary_keyword || brandName} ${city} ${state}`.trim()
        : keyword;

      const res = await apiFetch("/api/pipeline/start", {
        method: "POST",
        body: JSON.stringify({
          keyword: derivedKeyword,
          city,
          state,
          brand_id: brandId,
          location_id: selectedLocationId || undefined,
          template_id: selectedTemplate?.id || undefined,
          content_type: contentType,
          competitor_urls: competitorUrls.length > 0 ? competitorUrls : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to start pipeline" }));
        setError(err.detail || "Failed to start pipeline");
        setPhase("idle");
        return;
      }
      const { pipeline_id } = await res.json();
      setPipelineId(pipeline_id);
      startPolling(pipeline_id);
    } catch (err: any) {
      setError(err.message || "Failed to start pipeline");
      setPhase("idle");
    }
  }

  // Save to history
  async function saveToHistory() {
    try {
      await apiFetch("/api/generations", {
        method: "POST",
        body: JSON.stringify({
          brand_id: brandId,
          location_id: selectedLocationId || undefined,
          keyword, city,
          content,
          outline: outlineData ? JSON.stringify(outlineData) : null,
          content_type: contentType,
          template_name: selectedTemplate?.name || null,
          model: "sonnet",
          word_count: wordCount || content.split(/\s+/).filter(Boolean).length,
          input_tokens: usage?.input_tokens || 0,
          output_tokens: usage?.output_tokens || 0,
          pop_brief: brief,
          pop_score: popScore,
          revision_count: revisionCount,
        }),
      });
      setSaved(true);
    } catch {}
  }

  // Export to Drive
  async function exportToDrive() {
    try {
      const res = await apiFetch("/api/export/gdrive", {
        method: "POST",
        body: JSON.stringify({
          title: `${keyword} - ${city} ${state}`,
          content,
          keyword, city,
          brand_id: brandId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setExportUrl(data.doc_url);
      }
    } catch {}
  }

  // Reset
  function reset() {
    stopPolling();
    setPhase("idle");
    setPipelineId(null);
    setContent("");
    setBrief(null);
    setOutlineData(null);
    setPopScore(null);
    setRevisionCount(0);
    setWordCount(0);
    setUsage(null);
    setError(null);
    setSaved(false);
    setExportUrl(null);
  }

  const isActive = activePhases.has(phase);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timerDisplay = mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display font-[800] text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.035em] m-0">
            {phaseLabels[phase]}
            {isActive && <span className="inline-block w-[1.5em] text-left animate-[ellipsis_1.5s_steps(4,end)_infinite]">...</span>}
          </h1>
          <p className="text-[13px] text-ink-70 mt-2 flex items-center gap-2">
            {phaseDescriptions[phase]}
            {isActive && <span className="text-[10px] text-ink-40 font-mono">{timerDisplay}</span>}
          </p>
        </div>
        {phase !== "idle" && (
          <Button variant="light" size="sm" onClick={reset}>Start over</Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="border-[1.5px] border-[#b91c1c] rounded-[14px] px-5 py-3 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
          {error}
        </div>
      )}

      {/* INPUTS (idle phase) */}
      {phase === "idle" && (
        <div className="space-y-4">
          {/* Brand */}
          <div>
            <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">Brand</label>
            <select value={brandId} onChange={e => {
              const brand = brands.find(b => b.id === e.target.value);
              if (brand) { setBrandId(brand.id); setBrandName(brand.name); setSelectedTemplate(null); setSelectedLocationId(""); }
            }} className="w-full h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] font-mono text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] appearance-none cursor-pointer">
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Location (required) */}
          <div>
            <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">Location</label>
            {locations.length > 0 ? (
              <select value={selectedLocationId} onChange={e => {
                const loc = locations.find(l => l.id === e.target.value);
                setSelectedLocationId(e.target.value);
                if (loc) { setCity(loc.city); setState(loc.state); }
              }} className="w-full h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] appearance-none cursor-pointer">
                <option value="">Select a location</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name || `${brandName} ${l.city}`}, {l.state}</option>)}
              </select>
            ) : (
              <div className="text-[12px] text-ink-40 py-3">No locations for this brand. <a href="/locations" className="text-ink-70 underline">Add one first.</a></div>
            )}
          </div>

          {/* Keyword + slug: city landing pages auto-derive keyword from brand */}
          {contentType === "landing_page" ? (
            <div>
              <div className="text-[12px] text-ink-40 mb-2">
                Keyword: <span className="text-ink">{brands.find(b => b.id === brandId)?.primary_keyword || brandName} {city} {state}</span>
              </div>
              <div>
                <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">Page slug</label>
                <input value={pageSlug} onChange={e => setPageSlug(e.target.value)} placeholder={`/${city.toLowerCase().replace(/\s+/g, '-')}-${state.toLowerCase()}`} className="w-full h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)]" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">
              <KeywordInput keyword={keyword} city={city} state={state} onKeywordChange={setKeyword} onCityChange={setCity} onStateChange={setState} />
              <div>
                <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">Page slug</label>
                <input value={pageSlug} onChange={e => setPageSlug(e.target.value)} placeholder="/insulation-services-columbus-oh" className="w-full h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)]" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 max-[820px]:grid-cols-1">
            <div>
              <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">Content type</label>
              <select value={contentType} onChange={e => setContentType(e.target.value)} className="w-full h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] font-mono text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] appearance-none cursor-pointer">
                <option value="landing_page">City Landing Page</option>
                <option value="service_page">Service Page</option>
                <option value="blog_post">Blog Post</option>
                <option value="product_page">Product Page</option>
              </select>
            </div>
            <TemplateSelector brandName={brandName} selectedId={selectedTemplate?.id || ""} onSelect={setSelectedTemplate} />
            <CompetitorInput urls={competitorUrls} onChange={setCompetitorUrls} />
          </div>

          <Button variant="ink" onClick={startPipeline} disabled={
            (contentType !== "landing_page" && !keyword.trim()) || !city.trim() || !selectedLocationId || !pageSlug.trim()
          }>
            Generate content
          </Button>
        </div>
      )}

      {/* Progress indicator for active phases */}
      {isActive && (
        <div className="border-[1.5px] border-line rounded-[14px] bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-ink animate-pulse" />
            <span className="text-[13px] text-ink">{phaseDescriptions[phase]}</span>
          </div>
          {/* Phase dots */}
          <div className="flex gap-4 mt-4">
            {(["brief", "outline", "generating", "scoring"] as Phase[]).map(p => {
              const pIdx = ["brief", "outline", "generating", "scoring"].indexOf(p);
              const currentIdx = ["brief", "outline", "generating", "scoring"].indexOf(phase === "revising" ? "scoring" : phase);
              const isDone = pIdx < currentIdx || phase === "done";
              const isCurrent = p === phase || (phase === "revising" && p === "scoring");
              return (
                <div key={p} className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isDone ? "bg-[#1F7A3A]" : isCurrent ? "bg-ink animate-pulse" : "bg-ink-40"}`} />
                  <span className={`text-[10px] tracking-[0.04em] ${isDone ? "text-[#1F7A3A]" : isCurrent ? "text-ink" : "text-ink-40"}`}>
                    {p === "brief" ? "SEO Brief" : p === "outline" ? "Outline" : p === "generating" ? "Writing" : "Scoring"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Outline preview (while running) */}
      {outlineData && phase !== "done" && phase !== "idle" && (
        <div className="border border-line rounded-[14px] p-5">
          <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-2">Outline</div>
          <div className="font-display font-[800] text-lg mb-2">{outlineData.h1}</div>
          <div className="flex flex-wrap gap-2">
            {(outlineData.sections || []).map((s: any, i: number) => (
              <span key={i} className="text-[11px] text-ink-70 bg-[#F3F1ED] px-2 py-1 rounded-lg">{s.h2}</span>
            ))}
          </div>
        </div>
      )}

      {/* Content preview (while generating/scoring/revising) */}
      {content && isActive && (
        <ContentViewer content={content} isStreaming={phase === "generating" || phase === "revising"} />
      )}

      {/* DONE STATE */}
      {phase === "done" && content && (
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_320px] gap-4 max-[980px]:grid-cols-1">
            <div className="space-y-4">
              <ContentViewer content={content} onEdit={setContent} />
              {brief?.term_targets && (
                <TermHeatmap content={content} termTargets={brief.term_targets} />
              )}
            </div>
            <div className="space-y-4">
              {popScore && (
                <POPScoreCard
                  score={popScore}
                  contentWordCount={wordCount || content.split(/\s+/).filter(Boolean).length}
                />
              )}
              {usage && (
                <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 space-y-1">
                  <div>Tokens: {(usage.input_tokens || 0).toLocaleString()} in / {(usage.output_tokens || 0).toLocaleString()} out</div>
                  {revisionCount > 0 && <div>Revisions: {revisionCount}</div>}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Button variant="ink" size="sm" onClick={saveToHistory} disabled={saved}>
              {saved ? "Saved" : "Save to history"}
            </Button>
            <Button variant="light" size="sm" onClick={() => navigator.clipboard.writeText(content)}>
              Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={exportToDrive} disabled={!!exportUrl}>
              {exportUrl ? "Exported" : "Export to Drive"}
            </Button>
            <Button variant="light" size="sm" onClick={startPipeline}>
              Regenerate
            </Button>
            {exportUrl && (
              <a href={exportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-ink-70 underline">
                Open in Drive
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
