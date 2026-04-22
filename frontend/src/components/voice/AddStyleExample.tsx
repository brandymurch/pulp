"use client";
import { useState } from "react";
import { Input } from "@/components/shared/Input";
import { Button } from "@/components/shared/Button";

interface AddStyleExampleProps {
  onAdd: (data: { title: string; content: string; url?: string }) => Promise<void>;
}

export function AddStyleExample({ onAdd }: AddStyleExampleProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    try {
      await onAdd({ title: title.trim(), content: content.trim(), url: url.trim() || undefined });
      setTitle("");
      setUrl("");
      setContent("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-[1.5px] border-ink rounded-[18px] p-6 space-y-4">
      <h3 className="font-display font-[800] text-base tracking-[-0.02em] m-0">
        Add <span className="font-display font-normal text-pulp-deep">example</span>
      </h3>

      <div className="grid grid-cols-2 gap-3 max-[820px]:grid-cols-1">
        <Input label="Title" placeholder="Blog post about services" value={title} onChange={e => setTitle(e.target.value)} />
        <Input label="Source URL (optional)" placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} />
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-[10px] tracking-[0.22em] uppercase text-ink-70">Content</label>
          {wordCount > 0 && <span className="text-[10px] text-ink-40">{wordCount} words</span>}
        </div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Paste a sample of the brand's copy here..."
          rows={8}
          className="w-full border-[1.5px] border-ink rounded-[14px] bg-white text-ink px-4 py-3 font-mono text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] resize-y"
        />
      </div>

      <Button variant="ink" size="sm" disabled={!title.trim() || !content.trim() || submitting}>
        {submitting ? "Adding..." : "Add style example"}
      </Button>
    </form>
  );
}
