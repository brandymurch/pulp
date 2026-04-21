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
  onRevise?: () => void;
  isRevising?: boolean;
}

export function POPScoreCard({ score, onRevise, isRevising }: POPScoreCardProps) {
  const scoreColor = score.overall_score >= 80 ? "text-green" : score.overall_score >= 60 ? "text-amber" : "text-[#b91c1c]";

  return (
    <div className="border-[1.5px] border-ink rounded-[18px] bg-white overflow-hidden">
      <div className="px-6 py-4 border-b-[1.5px] border-ink">
        <h3 className="font-display font-[800] text-base tracking-[-0.02em] m-0">
          SEO <span className="font-display italic font-normal">score</span>
        </h3>
      </div>

      <div className="p-6 space-y-4">
        {/* Big score */}
        <div className={`font-display font-[800] text-[56px] leading-[0.9] tracking-[-0.04em] ${scoreColor}`}>
          {score.overall_score}
          <span className="font-display italic font-normal text-[0.45em] text-ink-40 ml-1">/100</span>
        </div>

        {/* Breakdown */}
        <div className="flex gap-6 text-[11px]">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-1">Terms</div>
            <div className="font-display font-[800] text-lg">{score.term_score}</div>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-1">Word count</div>
            <div className="font-display font-[800] text-lg">{score.word_count_score}</div>
          </div>
        </div>

        {/* Recommendations */}
        {score.recommendations.length > 0 && (
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-2">Recommendations</div>
            <ul className="space-y-1.5">
              {score.recommendations.map((rec, i) => (
                <li key={i} className="text-[12px] text-ink-70 flex gap-2">
                  <span className="text-ink-40 mt-0.5">-</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Revise button */}
        {onRevise && (
          <Button variant="ghost" size="sm" onClick={onRevise} disabled={isRevising}>
            {isRevising ? "Revising..." : "Revise with SEO feedback"}
          </Button>
        )}
      </div>
    </div>
  );
}
