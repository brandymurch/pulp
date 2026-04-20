"use client";

import { useState, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

type Tab = "brief" | "draft" | "score";

interface TermTarget {
  phrase: string;
  weight: number;
  target: number;
}

interface Brief {
  target_word_count: number;
  term_targets: TermTarget[];
  lsa_phrases: string[];
}

interface ScoreResult {
  overall_score: number;
  term_score: number;
  word_count_score: number;
  recommendations: string[];
  well_optimized: { phrase: string; current: number; target: number }[];
  missing: { phrase: string; current: number; target: number }[];
}

export default function Home() {
  // Input state
  const [keyword, setKeyword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [services, setServices] = useState("");
  const [contentType, setContentType] = useState("blog_post");
  const [contextOpen, setContextOpen] = useState(false);

  // Output state
  const [activeTab, setActiveTab] = useState<Tab>("brief");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [score, setScore] = useState<ScoreResult | null>(null);

  // Loading state
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingScore, setLoadingScore] = useState(false);
  const [error, setError] = useState("");

  const handleGetBrief = useCallback(async () => {
    if (!keyword.trim()) return;
    setError("");
    setLoadingBrief(true);
    try {
      const res = await fetch(`${API}/api/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          location: city || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to get brief");
      }
      const data: Brief = await res.json();
      setBrief(data);
      setActiveTab("brief");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to get brief");
    } finally {
      setLoadingBrief(false);
    }
  }, [keyword, city]);

  const handleGenerate = useCallback(async () => {
    if (!keyword.trim() || !brief) return;
    setError("");
    setLoadingGenerate(true);
    try {
      const res = await fetch(`${API}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          brief: {
            target_word_count: brief.target_word_count,
            term_targets: brief.term_targets,
          },
          business_name: businessName || "Local Business",
          city: city || "United States",
          services: services
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          content_type: contentType,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to generate content");
      }
      const data = await res.json();
      setTitle(data.title);
      setDraft(data.content);
      setWordCount(data.word_count);
      setActiveTab("draft");

      // Auto-score after generation
      await handleScore(data.content);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate content");
    } finally {
      setLoadingGenerate(false);
    }
  }, [keyword, brief, businessName, city, services, contentType]);

  const handleScore = useCallback(
    async (content?: string) => {
      const textToScore = content || draft;
      if (!textToScore.trim() || !keyword.trim()) return;
      setLoadingScore(true);
      try {
        const res = await fetch(`${API}/api/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: textToScore,
            keyword: keyword.trim(),
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Failed to score content");
        }
        const data: ScoreResult = await res.json();
        setScore(data);
        if (!content) setActiveTab("score");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to score content");
      } finally {
        setLoadingScore(false);
      }
    },
    [draft, keyword]
  );

  const handleDraftChange = (text: string) => {
    setDraft(text);
    setWordCount(text.split(/\s+/).filter(Boolean).length);
  };

  const scoreColor = (s: number) => {
    if (s >= 80) return "text-green-400";
    if (s >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const scoreBgColor = (s: number) => {
    if (s >= 80) return "bg-green-500/10 border-green-500/30";
    if (s >= 60) return "bg-yellow-500/10 border-yellow-500/30";
    return "bg-red-500/10 border-red-500/30";
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-black font-bold text-sm">P</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Pulp</h1>
          <span className="text-xs text-zinc-500 font-mono">SEO Content Engine</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left panel - Inputs */}
        <div className="w-full lg:w-[40%] border-r border-border p-6 flex flex-col gap-6 overflow-y-auto">
          {/* Keyword input */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Target Keyword
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. best plumber in austin"
              className="w-full bg-surface-raised border border-border rounded-lg px-4 py-3 text-lg text-white placeholder:text-zinc-600 font-medium"
            />
          </div>

          {/* Context section (collapsible) */}
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setContextOpen(!contextOpen)}
              className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <span>Business Context</span>
              <svg
                className={`w-4 h-4 transition-transform ${contextOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {contextOpen && (
              <div className="px-4 pb-4 flex flex-col gap-4 border-t border-border pt-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Business Name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Acme Plumbing"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">City / Location</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Austin, TX"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Services (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={services}
                    onChange={(e) => setServices(e.target.value)}
                    placeholder="drain cleaning, water heater repair, pipe installation"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Content type */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Content Type
            </label>
            <div className="flex gap-2">
              {[
                { value: "blog_post", label: "Blog Post" },
                { value: "service_page", label: "Service Page" },
                { value: "landing_page", label: "Landing Page" },
              ].map((type) => (
                <button
                  key={type.value}
                  onClick={() => setContentType(type.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    contentType === type.value
                      ? "bg-accent text-black"
                      : "bg-surface-raised border border-border text-zinc-400 hover:text-white"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3 mt-auto pt-4">
            <button
              onClick={handleGetBrief}
              disabled={!keyword.trim() || loadingBrief}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-surface-raised border border-accent text-accent hover:bg-accent/10"
            >
              {loadingBrief ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Getting Brief...
                </span>
              ) : (
                "1. Get Brief"
              )}
            </button>
            <button
              onClick={handleGenerate}
              disabled={!brief || loadingGenerate}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-accent text-black hover:bg-green-400"
            >
              {loadingGenerate ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Generating...
                </span>
              ) : (
                "2. Generate Content"
              )}
            </button>
            <button
              onClick={() => handleScore()}
              disabled={!draft.trim() || loadingScore}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-surface-raised border border-border text-zinc-300 hover:text-white hover:border-zinc-600"
            >
              {loadingScore ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Scoring...
                </span>
              ) : (
                "Re-score"
              )}
            </button>
          </div>

          {/* Error display */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Right panel - Output */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="border-b border-border px-6 flex gap-1 pt-2">
            {(["brief", "draft", "score"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab
                    ? "bg-surface-raised text-white border-t border-x border-border"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tab === "brief" && "Brief"}
                {tab === "draft" && "Draft"}
                {tab === "score" && (
                  <span className="flex items-center gap-2">
                    Score
                    {score && (
                      <span className={`font-mono text-xs ${scoreColor(score.overall_score)}`}>
                        {score.overall_score}
                      </span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Brief tab */}
            {activeTab === "brief" && (
              <div>
                {!brief ? (
                  <EmptyState message="Enter a keyword and click &quot;Get Brief&quot; to start" />
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center gap-6">
                      <div className="bg-surface-raised border border-border rounded-lg px-5 py-4">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                          Target Words
                        </div>
                        <div className="text-2xl font-mono font-bold text-accent">
                          {brief.target_word_count.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-surface-raised border border-border rounded-lg px-5 py-4">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                          Terms
                        </div>
                        <div className="text-2xl font-mono font-bold text-white">
                          {brief.term_targets.length}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                        Term Targets
                      </h3>
                      <div className="bg-surface-raised border border-border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left px-4 py-2 text-xs text-zinc-500 font-medium">
                                Phrase
                              </th>
                              <th className="text-right px-4 py-2 text-xs text-zinc-500 font-medium">
                                Weight
                              </th>
                              <th className="text-right px-4 py-2 text-xs text-zinc-500 font-medium">
                                Target
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {brief.term_targets
                              .sort((a, b) => b.weight - a.weight)
                              .slice(0, 30)
                              .map((term, i) => (
                                <tr key={i} className="border-b border-border/50 last:border-0">
                                  <td className="px-4 py-2 font-mono text-zinc-200">
                                    {term.phrase}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-zinc-500">
                                    {term.weight.toFixed(1)}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-accent">
                                    {term.target}x
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Draft tab */}
            {activeTab === "draft" && (
              <div className="h-full flex flex-col">
                {!draft ? (
                  <EmptyState message="Generate content to see your draft here" />
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {title && (
                          <h3 className="text-sm font-semibold text-zinc-300">{title}</h3>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-zinc-500">
                          {wordCount.toLocaleString()} words
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`# ${title}\n\n${draft}`);
                          }}
                          className="text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1 rounded border border-border hover:border-zinc-600"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={draft}
                      onChange={(e) => handleDraftChange(e.target.value)}
                      className="flex-1 w-full min-h-[500px] bg-surface-raised border border-border rounded-lg p-4 text-sm text-zinc-200 font-mono leading-relaxed"
                    />
                  </>
                )}
              </div>
            )}

            {/* Score tab */}
            {activeTab === "score" && (
              <div>
                {!score ? (
                  <EmptyState message="Generate or score content to see results" />
                ) : (
                  <div className="space-y-6">
                    {/* Score overview */}
                    <div className="flex items-center gap-6">
                      <div className={`rounded-lg border px-6 py-5 ${scoreBgColor(score.overall_score)}`}>
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                          Overall
                        </div>
                        <div className={`text-4xl font-mono font-bold ${scoreColor(score.overall_score)}`}>
                          {score.overall_score}
                        </div>
                      </div>
                      <div className="bg-surface-raised border border-border rounded-lg px-5 py-4">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                          Terms
                        </div>
                        <div className={`text-2xl font-mono font-bold ${scoreColor(score.term_score)}`}>
                          {score.term_score}
                        </div>
                      </div>
                      <div className="bg-surface-raised border border-border rounded-lg px-5 py-4">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                          Word Count
                        </div>
                        <div className={`text-2xl font-mono font-bold ${scoreColor(score.word_count_score)}`}>
                          {score.word_count_score}
                        </div>
                      </div>
                    </div>

                    {/* Recommendations */}
                    {score.recommendations.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                          Recommendations
                        </h3>
                        <div className="space-y-2">
                          {score.recommendations.map((rec, i) => (
                            <div
                              key={i}
                              className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-4 py-3 text-sm text-yellow-300"
                            >
                              {rec}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Well optimized */}
                    {score.well_optimized.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-green-400 mb-3">
                          Well Optimized
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {score.well_optimized.map((term, i) => (
                            <span
                              key={i}
                              className="px-3 py-1 bg-green-500/10 border border-green-500/30 rounded-full text-xs font-mono text-green-400"
                            >
                              {term.phrase}{" "}
                              <span className="text-green-600">
                                {term.current}/{term.target}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Missing terms */}
                    {score.missing.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-red-400 mb-3">
                          Missing Terms
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {score.missing.map((term, i) => (
                            <span
                              key={i}
                              className="px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-full text-xs font-mono text-red-400"
                            >
                              {term.phrase}{" "}
                              <span className="text-red-600">
                                0/{term.target}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full min-h-[300px] flex items-center justify-center">
      <p className="text-zinc-600 text-sm">{message}</p>
    </div>
  );
}
