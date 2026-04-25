"use client";
import { Button } from "@/components/shared/Button";

interface ContentViewerProps {
  content: string;
  isStreaming?: boolean;
  onEdit?: (content: string) => void;
}

export function ContentViewer({ content, isStreaming = false, onEdit }: ContentViewerProps) {
  async function copyToClipboard() {
    await navigator.clipboard.writeText(content);
  }

  return (
    <div className="border-[1.5px] border-ink rounded-[18px] bg-white overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b-[1.5px] border-ink">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-[800] text-base tracking-[-0.02em] m-0">Content</h3>
          {isStreaming && (
            <span className="w-2 h-2 rounded-full bg-green animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] tracking-[0.22em] uppercase text-ink-70">
          <span>{content.split(/\s+/).filter(Boolean).length} words</span>
          <Button variant="light" size="sm" onClick={copyToClipboard}>Copy</Button>
        </div>
      </div>
      <div className="p-6">
        {onEdit ? (
          <textarea
            value={content}
            onChange={e => onEdit(e.target.value)}
            className="w-full min-h-[400px] bg-transparent font-mono text-[13px] leading-[1.7] text-ink outline-none resize-y"
          />
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-[13px] leading-[1.7] text-ink m-0">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
