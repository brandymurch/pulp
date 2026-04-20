"use client";

interface TermTarget {
  phrase: string;
  target: number;
  weight?: number;
}

interface TermHeatmapProps {
  content: string;
  termTargets: TermTarget[];
}

export function TermHeatmap({ content, termTargets }: TermHeatmapProps) {
  const contentLower = content.toLowerCase();

  const results = termTargets
    .filter(t => t.target > 0)
    .map(t => {
      const regex = new RegExp(`\\b${t.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      const matches = contentLower.match(regex);
      const current = matches ? matches.length : 0;
      const hit = current >= t.target;
      return { ...t, current, hit };
    })
    .sort((a, b) => (b.weight || 0) - (a.weight || 0));

  const hits = results.filter(r => r.hit);
  const misses = results.filter(r => !r.hit);

  return (
    <div className="border-[1.5px] border-line rounded-[14px] p-4 space-y-3">
      <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70">
        Term coverage: {hits.length}/{results.length}
      </div>

      {hits.length > 0 && (
        <div>
          <div className="text-[9px] tracking-[0.18em] uppercase text-green mb-1.5">Hit</div>
          <div className="flex flex-wrap gap-1.5">
            {hits.slice(0, 15).map((t, i) => (
              <span key={i} className="text-[10px] bg-[rgba(31,122,58,0.1)] text-green px-2 py-0.5 rounded-full border border-green/30">
                {t.phrase} ({t.current}/{t.target})
              </span>
            ))}
          </div>
        </div>
      )}

      {misses.length > 0 && (
        <div>
          <div className="text-[9px] tracking-[0.18em] uppercase text-[#b91c1c] mb-1.5">Missing</div>
          <div className="flex flex-wrap gap-1.5">
            {misses.slice(0, 15).map((t, i) => (
              <span key={i} className="text-[10px] bg-[rgba(185,28,28,0.08)] text-[#b91c1c] px-2 py-0.5 rounded-full border border-[#b91c1c]/20">
                {t.phrase} ({t.current}/{t.target})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
