"use client";
import { Button } from "@/components/shared/Button";

interface GenerationDetailProps {
  generation: any;
  onClose: () => void;
}

export function GenerationDetail({ generation, onClose }: GenerationDetailProps) {
  const g = generation;

  return (
    <div className="border-[1.5px] border-ink rounded-[18px] bg-white overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b-[1.5px] border-ink">
        <div>
          <h3 className="font-display font-[800] text-lg tracking-[-0.02em] m-0">{g.keyword}</h3>
          <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70 mt-1">
            {g.city} {g.template_name ? `/ ${g.template_name}` : ""} / {new Date(g.created_at).toLocaleDateString()}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="light" size="sm" onClick={() => navigator.clipboard.writeText(g.content)}>
            Copy
          </Button>
          <Button variant="light" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Metadata */}
        <div className="flex gap-6 text-[10px] tracking-[0.22em] uppercase text-ink-40">
          <span>{g.word_count.toLocaleString()} words</span>
          <span>Model: {g.model}</span>
          {g.input_tokens > 0 && <span>Tokens: {g.input_tokens.toLocaleString()} in / {g.output_tokens.toLocaleString()} out</span>}
          {g.revision_count > 0 && <span>Revisions: {g.revision_count}</span>}
          {g.pop_score && <span className="text-ink-70">POP: {g.pop_score.overall_score}/100</span>}
        </div>

        {/* Content */}
        <pre className="whitespace-pre-wrap font-mono text-[13px] leading-[1.7] text-ink bg-line-soft rounded-[14px] p-5 max-h-[600px] overflow-y-auto">
          {g.content}
        </pre>
      </div>
    </div>
  );
}
