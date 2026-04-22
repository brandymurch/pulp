"use client";
import { Button } from "@/components/shared/Button";

interface POPScoreCardProps {
  score: {
    overall_score: number;
    term_score: number;
    word_count_score: number;
    recommendations: string[];
    well_optimized: { phrase: string; current: number; target: number }[];
    missing: { phrase: string; current: number; target: number }[];
  };
  contentWordCount?: number;
  onRevise?: () => void;
  isRevising?: boolean;
}

export function POPScoreCard({ score, contentWordCount, onRevise, isRevising }: POPScoreCardProps) {
  if (!score || typeof score.overall_score !== "number") return null;

  const scoreColor = score.overall_score >= 80
    ? "text-[#1F7A3A]"
    : score.overall_score >= 60
    ? "text-[#B5730F]"
    : "text-[#b91c1c]";

  const scoreBg = score.overall_score >= 80
    ? "bg-[rgba(31,122,58,0.06)]"
    : score.overall_score >= 60
    ? "bg-[rgba(181,115,15,0.06)]"
    : "bg-[rgba(185,28,28,0.05)]";

  return (
    <div className="border-[1.5px] border-ink rounded-[18px] bg-white overflow-hidden">
      <div className="px-6 py-4 border-b-[1.5px] border-ink">
        <h3 className="font-display font-[800] text-base tracking-[-0.02em] m-0">
          SEO <span className="font-display font-normal text-pulp-deep">score</span>
        </h3>
      </div>

      <div className="p-6 space-y-5">
        {/* Big score */}
        <div className={`${scoreBg} rounded-[14px] p-5 flex items-end gap-4`}>
          <div className={`font-display font-[800] text-[56px] leading-[0.9] tracking-[-0.04em] ${scoreColor}`}>
            {score.overall_score}
            <span className="font-display font-normal text-[0.45em] text-ink-40 ml-1">/100</span>
          </div>
          <div className="text-[11px] text-ink-40 pb-2">
            {score.overall_score >= 80 && "Strong. Ready to publish."}
            {score.overall_score >= 60 && score.overall_score < 80 && "Decent. Could improve with revision."}
            {score.overall_score < 60 && "Needs work. Revise to improve term coverage."}
          </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-line rounded-lg p-3">
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-1">Term score</div>
            <div className="font-display font-[800] text-2xl">{score.term_score}<span className="text-ink-40 text-sm font-normal">/100</span></div>
          </div>
          <div className="border border-line rounded-lg p-3">
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-1">Word count</div>
            <div className="font-display font-[800] text-2xl">{score.word_count_score}<span className="text-ink-40 text-sm font-normal">/100</span></div>
            {contentWordCount != null && contentWordCount > 0 && (
              <div className="text-[10px] text-ink-40 mt-0.5">{contentWordCount.toLocaleString()} words</div>
            )}
          </div>
          <div className="border border-line rounded-lg p-3">
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-1">Terms hit</div>
            <div className="font-display font-[800] text-2xl">
              {score.well_optimized?.length || 0}
              <span className="text-ink-40 text-sm font-normal">/{(score.well_optimized?.length || 0) + (score.missing?.length || 0)}</span>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {score.recommendations && score.recommendations.length > 0 && (
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-2">Recommendations</div>
            <div className="space-y-1.5">
              {score.recommendations.map((rec, i) => (
                <div key={i} className="text-[12px] text-ink-70 flex gap-2 leading-[1.5]">
                  <span className="text-pulp-deep mt-px shrink-0">*</span>
                  {rec}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing terms */}
        {score.missing && score.missing.length > 0 && (
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-[#b91c1c] mb-2">
              Missing terms ({score.missing.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {score.missing.map((t, i) => (
                <span key={i} className="text-[10px] bg-[rgba(185,28,28,0.06)] text-[#b91c1c] px-2 py-1 rounded-lg border border-[#b91c1c]/15 font-mono">
                  {t.phrase} <span className="text-[#b91c1c]/60">{t.current}/{t.target}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Well optimized terms */}
        {score.well_optimized && score.well_optimized.length > 0 && (
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-[#1F7A3A] mb-2">
              Well optimized ({score.well_optimized.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {score.well_optimized.map((t, i) => (
                <span key={i} className="text-[10px] bg-[rgba(31,122,58,0.06)] text-[#1F7A3A] px-2 py-1 rounded-lg border border-[#1F7A3A]/15 font-mono">
                  {t.phrase} <span className="text-[#1F7A3A]/60">{t.current}/{t.target}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Revise button */}
        {onRevise && (
          <div className="pt-2">
            <Button variant="ghost" size="sm" onClick={onRevise} disabled={isRevising}>
              {isRevising ? "Revising..." : "Revise with SEO feedback"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
