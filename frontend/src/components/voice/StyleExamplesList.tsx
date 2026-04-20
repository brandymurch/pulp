"use client";

interface StyleExample {
  id: string;
  title: string;
  content: string;
  url: string | null;
  word_count: number;
  created_at: string;
}

interface StyleExamplesListProps {
  examples: StyleExample[];
  onDelete: (id: string) => void;
}

export function StyleExamplesList({ examples, onDelete }: StyleExamplesListProps) {
  if (examples.length === 0) {
    return (
      <div className="text-[13px] text-ink-40 text-center py-12">
        No style examples yet. Add your first one below to define the brand voice.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {examples.map(ex => (
        <div key={ex.id} className="border-[1.5px] border-line rounded-[14px] p-5 hover:border-ink transition-colors">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <div className="font-display font-[800] text-[15px] tracking-[-0.01em]">{ex.title}</div>
              <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mt-1">
                {ex.word_count} words
                {ex.url && <> / <a href={ex.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">{new URL(ex.url).hostname}</a></>}
              </div>
            </div>
            <button
              onClick={() => onDelete(ex.id)}
              className="text-[11px] text-ink-40 hover:text-[#b91c1c] transition-colors shrink-0"
            >
              Delete
            </button>
          </div>
          <p className="text-[13px] text-ink-70 leading-[1.6] m-0 line-clamp-3">
            {ex.content.slice(0, 300)}{ex.content.length > 300 ? "..." : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
