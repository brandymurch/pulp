"use client";
import type { Generation } from "@/lib/types";
import { FRANCHISE_PAGE_TYPES } from "@/lib/types";

const franchisePageTypeMap = Object.fromEntries(
  FRANCHISE_PAGE_TYPES.map((t) => [t.key, t.label])
) as Record<string, string>;

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
    <div className="border border-line rounded-[18px] overflow-hidden">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b border-line">Keyword</th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b border-line">Page</th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b border-line">Template</th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b border-line">Words</th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b border-line">Score</th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b border-line">Date</th>
            <th className="px-5 py-2.5 bg-line-soft border-b border-line"></th>
          </tr>
        </thead>
        <tbody>
          {generations.map(gen => (
            <tr
              key={gen.id}
              onClick={() => onSelect(gen)}
              className={`cursor-pointer transition-colors ${selectedId === gen.id ? "bg-line-soft" : "hover:bg-line-soft"}`}
            >
              <td className="px-5 py-2 border-b border-line font-display font-[800] text-[13px]">{gen.keyword}</td>
              <td className="px-5 py-2 border-b border-line text-ink-70">
                {gen.content_type && franchisePageTypeMap[gen.content_type]
                  ? franchisePageTypeMap[gen.content_type]
                  : gen.content_type?.startsWith("franchise")
                    ? "FranDev page"
                    : gen.city}
              </td>
              <td className="px-5 py-2 border-b border-line text-ink-40">{gen.template_name || "-"}</td>
              <td className="px-5 py-2 border-b border-line text-ink-70">{gen.word_count.toLocaleString()}</td>
              <td className="px-5 py-2 border-b border-line">
                {gen.pop_score ? (
                  <span className={gen.pop_score.overall_score >= 80 ? "text-green font-display font-[800]" : gen.pop_score.overall_score >= 60 ? "text-amber font-display font-[800]" : "text-[#b91c1c] font-display font-[800]"}>
                    {gen.pop_score.overall_score}
                  </span>
                ) : "-"}
              </td>
              <td className="px-5 py-2 border-b border-line text-ink-40 text-[11px]">
                {new Date(gen.created_at).toLocaleDateString()}
              </td>
              <td className="px-5 py-2 border-b border-line text-right">
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
