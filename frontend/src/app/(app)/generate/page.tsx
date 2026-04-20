"use client";
import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useGeneration } from "@/hooks/useGeneration";
import { Button } from "@/components/shared/Button";
import { KeywordInput } from "@/components/generate/KeywordInput";
import { TemplateSelector } from "@/components/generate/TemplateSelector";
import { CompetitorInput } from "@/components/generate/CompetitorInput";
import { PipelineProgress, PipelineStep } from "@/components/generate/PipelineProgress";
import { OutlineReview } from "@/components/generate/OutlineReview";
import { ContentViewer } from "@/components/generate/ContentViewer";
import { TermHeatmap } from "@/components/generate/TermHeatmap";
import { POPScoreCard } from "@/components/generate/POPScoreCard";

type Phase = "idle" | "researching" | "outline" | "generating" | "scoring" | "revising" | "done";

export default function GeneratePage() {
  // Inputs
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([]);

  // Pipeline state
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [brief, setBrief] = useState<any>(null);
  const [templateContent, setTemplateContent] = useState<any>(null);
  const [styleExamples, setStyleExamples] = useState<any[]>([]);
  const [paaQuestions, setPaaQuestions] = useState<string[]>([]);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [outlineData, setOutlineData] = useState<any>(null);
  const [popScore, setPopScore] = useState<any>(null);
  const [revisionCount, setRevisionCount] = useState(0);
  const [brands, setBrands] = useState<any[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [brandName, setBrandName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const gen = useGeneration();

  // Load brands on mount
  useEffect(() => {
    async function loadBrands() {
      try {
        const res = await apiFetch("/api/brands");
        if (res.ok) {
          const data = await res.json();
          setBrands(data);
          if (data.length > 0) {
            setBrandId(data[0].id);
            setBrandName(data[0].name);
          }
        }
      } catch {
        // brands endpoint not available
      }
    }
    loadBrands();
  }, []);

  // Helper to update a specific step
  const updateStep = useCallback((label: string, status: PipelineStep["status"]) => {
    setSteps(prev => prev.map(s => s.label === label ? { ...s, status } : s));
  }, []);

  // -- RESEARCH PHASE --
  async function startResearch() {
    setPhase("researching");
    setError(null);
    setSaved(false);
    setExportUrl(null);
    setPopScore(null);
    setRevisionCount(0);

    const initialSteps: PipelineStep[] = [
      { label: "POP brief", status: "loading" },
      { label: "Style examples", status: "loading" },
      { label: "Template", status: selectedTemplate ? "loading" : "skipped" },
      { label: "Competitors", status: competitorUrls.length > 0 ? "loading" : "skipped" },
      { label: "PAA questions", status: "loading" },
    ];
    setSteps(initialSteps);

    // Fetch brand ID first
    try {
      const brandsRes = await apiFetch("/api/brands");
      if (brandsRes.ok) {
        const brands = await brandsRes.json();
        if (brands.length > 0) setBrandId(brands[0].id);
      }
    } catch {}

    // Fire parallel research calls
    const results = await Promise.allSettled([
      // 0: POP brief (REQUIRED)
      apiFetch("/api/brief", {
        method: "POST",
        body: JSON.stringify({ keyword, location: `${city}, ${state}` }),
      }).then(async r => {
        if (!r.ok) throw new Error("Brief fetch failed");
        return r.json();
      }),

      // 1: Style examples (REQUIRED)
      apiFetch(`/api/style-examples?brand_id=${brandId || ""}`).then(async r => {
        if (!r.ok) return [];
        return r.json();
      }),

      // 2: Template (REQUIRED if selected)
      selectedTemplate
        ? apiFetch(`/api/notion/templates/${selectedTemplate.id}`).then(async r => {
            if (!r.ok) throw new Error("Template fetch failed");
            return r.json();
          })
        : Promise.resolve(null),

      // 3: Competitors (OPTIONAL)
      competitorUrls.length > 0
        ? Promise.all(
            competitorUrls.map(url =>
              apiFetch("/api/scrape", { method: "POST", body: JSON.stringify({ url }) })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
            )
          ).then(results => results.filter(Boolean))
        : Promise.resolve([]),

      // 4: PAA questions (OPTIONAL)
      apiFetch("/api/serp", {
        method: "POST",
        body: JSON.stringify({ keyword, location: `${city}, ${state}` }),
      }).then(async r => {
        if (!r.ok) return { paa_questions: [] };
        return r.json();
      }),
    ]);

    // Process results
    const labels = ["POP brief", "Style examples", "Template", "Competitors", "PAA questions"];
    const required = [true, true, !!selectedTemplate, false, false];

    let aborted = false;
    results.forEach((result, i) => {
      if (initialSteps[i].status === "skipped") return;
      if (result.status === "fulfilled") {
        updateStep(labels[i], "done");
      } else {
        if (required[i]) {
          updateStep(labels[i], "failed");
          aborted = true;
        } else {
          updateStep(labels[i], "skipped");
        }
      }
    });

    if (aborted) {
      setError("Required research step failed. Check your API keys and try again.");
      setPhase("idle");
      return;
    }

    // Extract values
    const briefData = results[0].status === "fulfilled" ? (results[0] as any).value : null;
    const examples = results[1].status === "fulfilled" ? (results[1] as any).value : [];
    const tmpl = results[2].status === "fulfilled" ? (results[2] as any).value : null;
    const comps = results[3].status === "fulfilled" ? (results[3] as any).value : [];
    const serpData = results[4].status === "fulfilled" ? (results[4] as any).value : { paa_questions: [] };

    setBrief(briefData);
    setStyleExamples(examples);
    setTemplateContent(tmpl);
    setCompetitors(comps);
    setPaaQuestions(serpData.paa_questions || []);

    // Move to outline phase
    setPhase("outline");
    try {
      const outlineRes = await apiFetch("/api/generate/outline", {
        method: "POST",
        body: JSON.stringify({
          keyword, city, state,
          brief: briefData,
          template: tmpl,
          paa_questions: serpData.paa_questions || [],
          competitors: comps,
          style_examples: examples,
        }),
      });
      if (!outlineRes.ok) throw new Error("Outline generation failed");
      const outline = await outlineRes.json();
      setOutlineData(outline);
    } catch (err: any) {
      setError(err.message || "Outline generation failed");
      setPhase("idle");
    }
  }

  // -- GENERATION PHASE --
  async function startGeneration(approvedOutline: any) {
    setOutlineData(approvedOutline);
    setPhase("generating");

    await gen.generate("/api/generate", {
      keyword, city, state,
      brief,
      outline: approvedOutline,
      template: templateContent,
      style_examples: styleExamples,
      competitor_content: competitors,
    });

    // After generation completes, score
    setPhase("scoring");
    await scoreContent(gen.output || "");
  }

  // -- SCORING PHASE --
  async function scoreContent(content: string) {
    try {
      const res = await apiFetch("/api/score", {
        method: "POST",
        body: JSON.stringify({ content, keyword }),
      });
      if (!res.ok) {
        setPhase("done");
        return;
      }
      const score = await res.json();
      setPopScore(score);

      // Auto-revise if score < 75 and under 2 revisions
      if (score.overall_score < 75 && revisionCount < 2) {
        setPhase("revising");
        setRevisionCount(prev => prev + 1);
        await gen.generate("/api/generate/revise", {
          content,
          keyword,
          brief,
          pop_feedback: score,
        });
        // Re-score after revision
        setPhase("scoring");
        await scoreContent(gen.output || content);
      } else {
        setPhase("done");
      }
    } catch {
      setPhase("done");
    }
  }

  // -- SAVE --
  async function saveToHistory() {
    try {
      await apiFetch("/api/generations", {
        method: "POST",
        body: JSON.stringify({
          brand_id: brandId,
          keyword, city,
          content: gen.output,
          outline: outlineData ? JSON.stringify(outlineData) : null,
          content_type: "landing_page",
          template_name: selectedTemplate?.name || null,
          model: "sonnet",
          word_count: gen.output.split(/\s+/).filter(Boolean).length,
          input_tokens: gen.usage?.input_tokens || 0,
          output_tokens: gen.usage?.output_tokens || 0,
          pop_brief: brief,
          pop_score: popScore,
          revision_count: revisionCount,
        }),
      });
      setSaved(true);
    } catch {}
  }

  // -- EXPORT TO DRIVE --
  async function exportToDrive() {
    try {
      const res = await apiFetch("/api/export/gdrive", {
        method: "POST",
        body: JSON.stringify({
          title: `${keyword} - ${city} ${state}`,
          content: gen.output,
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

  // -- RESET --
  function reset() {
    setPhase("idle");
    setSteps([]);
    setBrief(null);
    setTemplateContent(null);
    setStyleExamples([]);
    setPaaQuestions([]);
    setCompetitors([]);
    setOutlineData(null);
    setPopScore(null);
    setRevisionCount(0);
    setError(null);
    setSaved(false);
    setExportUrl(null);
    gen.abort();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display font-[800] text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.035em] m-0">
            Generate
          </h1>
          <p className="text-[13px] text-ink-70 mt-2">
            Enter a keyword and city, select a template, and let the pipeline do the rest.
          </p>
        </div>
        {phase !== "idle" && (
          <Button variant="light" size="sm" onClick={reset}>Start over</Button>
        )}
      </div>

      {/* Error */}
      {(error || gen.error) && (
        <div className="border-[1.5px] border-[#b91c1c] rounded-[14px] px-5 py-3 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
          {error || gen.error}
        </div>
      )}

      {/* INPUTS (idle phase) */}
      {phase === "idle" && (
        <div className="space-y-4">
          {/* Brand selector */}
          <div>
            <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">Brand</label>
            <select
              value={brandId}
              onChange={e => {
                const brand = brands.find(b => b.id === e.target.value);
                if (brand) {
                  setBrandId(brand.id);
                  setBrandName(brand.name);
                  setSelectedTemplate(null);
                }
              }}
              className="w-full h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] font-mono text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] appearance-none cursor-pointer"
            >
              {brands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <KeywordInput
            keyword={keyword} city={city} state={state}
            onKeywordChange={setKeyword} onCityChange={setCity} onStateChange={setState}
          />
          <div className="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">
            <TemplateSelector
              brandName={brandName}
              selectedId={selectedTemplate?.id || ""}
              onSelect={setSelectedTemplate}
            />
            <CompetitorInput urls={competitorUrls} onChange={setCompetitorUrls} />
          </div>
          <Button
            variant="ink"
            onClick={startResearch}
            disabled={!keyword.trim() || !city.trim()}
          >
            Generate content
          </Button>
        </div>
      )}

      {/* PIPELINE PROGRESS (researching) */}
      {phase !== "idle" && steps.length > 0 && (
        <PipelineProgress steps={steps} />
      )}

      {/* OUTLINE REVIEW */}
      {phase === "outline" && outlineData && (
        <OutlineReview outline={outlineData} onApprove={startGeneration} />
      )}
      {phase === "outline" && !outlineData && (
        <div className="text-[13px] text-ink-70 animate-pulse">Generating outline...</div>
      )}

      {/* GENERATING / REVISING */}
      {(phase === "generating" || phase === "revising") && (
        <div className="space-y-4">
          {phase === "revising" && (
            <div className="text-[11px] tracking-[0.04em] text-ink-70 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber animate-pulse" />
              Auto-revising (round {revisionCount}/2) based on POP feedback...
            </div>
          )}
          <ContentViewer content={gen.output} isStreaming={gen.isGenerating} />
          {gen.isGenerating && (
            <Button variant="light" size="sm" onClick={gen.abort}>Cancel</Button>
          )}
        </div>
      )}

      {/* SCORING */}
      {phase === "scoring" && (
        <div className="text-[13px] text-ink-70 animate-pulse flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-ink animate-pulse" />
          Scoring with POP...
        </div>
      )}

      {/* DONE */}
      {phase === "done" && (
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_320px] gap-4 max-[980px]:grid-cols-1">
            <div className="space-y-4">
              <ContentViewer content={gen.output} onEdit={gen.setOutput} />
              {brief?.term_targets && (
                <TermHeatmap content={gen.output} termTargets={brief.term_targets} />
              )}
            </div>
            <div className="space-y-4">
              {popScore && (
                <POPScoreCard
                  score={popScore}
                  onRevise={revisionCount < 2 ? async () => {
                    setPhase("revising");
                    setRevisionCount(prev => prev + 1);
                    await gen.generate("/api/generate/revise", {
                      content: gen.output, keyword, brief, pop_feedback: popScore,
                    });
                    setPhase("scoring");
                    await scoreContent(gen.output);
                  } : undefined}
                />
              )}
              {gen.usage && (
                <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 space-y-1">
                  <div>Tokens: {gen.usage.input_tokens.toLocaleString()} in / {gen.usage.output_tokens.toLocaleString()} out</div>
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
            <Button variant="light" size="sm" onClick={() => navigator.clipboard.writeText(gen.output)}>
              Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={exportToDrive} disabled={!!exportUrl}>
              {exportUrl ? "Exported" : "Export to Drive"}
            </Button>
            {exportUrl && (
              <a href={exportUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-ink-70 underline">
                Open in Drive
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
