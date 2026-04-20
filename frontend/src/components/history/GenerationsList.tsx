"use client";
import { Button } from "@/components/shared/Button";

interface Generation {
  id: string;
  keyword: string;
  city: string;
  template_name: string | null;
  word_count: number;
  pop_score: { overall_score: number } | null;
  created_at: string;
}

interface GenerationsListProps {
  generations: Generation[];
  selectedId: string | null;
  onSelect: (gen: Generation) => void;
  onDelete: (id: string) => void;
}

export function GenerationsList({ generations, selectedId, onSelect, onDelete }: GenerationsListProps) {
  if (generations.length === 0) {
    return (
      <div className="text-[13px] text-ink-40 text-center py-12">
        No generations yet. Go to Generate to create your first one.
      </div>
    );
  }

  return (
    <div className="border-[1.5px] border-ink rounded-[18px] overflow-hidden">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b-[1.5px] border-ink">Keyword</th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b-[1.5px] border-ink">City</th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b-[1.5px] border-ink">Template</th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b-[1.5px] border-ink">Words</th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b-[1.5px] border-ink">Score</th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b-[1.5px] border-ink">Date</th>
            <th className="px-5 py-2.5 bg-line-soft border-b-[1.5px] border-ink"></th>
          </tr>
        </thead>
        <tbody>
          {generations.map(gen => (
            <tr
              key={gen.id}
              onClick={() => onSelect(gen)}
              className={`cursor-pointer transition-colors ${selectedId === gen.id ? "bg-line-soft" : "hover:bg-line-soft"}`}
            >
              <td className="px-5 py-3 border-b border-line font-display font-[800] text-[13px]">{gen.keyword}</td>
              <td className="px-5 py-3 border-b border-line text-ink-70">{gen.city}</td>
              <td className="px-5 py-3 border-b border-line text-ink-40">{gen.template_name || "-"}</td>
              <td className="px-5 py-3 border-b border-line text-ink-70">{gen.word_count.toLocaleString()}</td>
              <td className="px-5 py-3 border-b border-line">
                {gen.pop_score ? (
                  <span className={gen.pop_score.overall_score >= 80 ? "text-green font-display font-[800]" : gen.pop_score.overall_score >= 60 ? "text-amber font-display font-[800]" : "text-[#b91c1c] font-display font-[800]"}>
                    {gen.pop_score.overall_score}
                  </span>
                ) : "-"}
              </td>
              <td className="px-5 py-3 border-b border-line text-ink-40 text-[11px]">
                {new Date(gen.created_at).toLocaleDateString()}
              </td>
              <td className="px-5 py-3 border-b border-line text-right">
                <button
                  onClick={e => { e.stopPropagation(); onDelete(gen.id); }}
                  className="text-[11px] text-ink-40 hover:text-[#b91c1c] transition-colors"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
