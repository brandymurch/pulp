"use client";
import { useState } from "react";

interface CompetitorInputProps {
  urls: string[];
  onChange: (urls: string[]) => void;
}

export function CompetitorInput({ urls, onChange }: CompetitorInputProps) {
  const [text, setText] = useState(urls.join("\n"));

  function handleChange(value: string) {
    setText(value);
    const parsed = value.split("\n").map(u => u.trim()).filter(Boolean);
    onChange(parsed);
  }

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-[10px] tracking-[0.22em] uppercase text-ink-70">
          Competitor URLs (optional)
        </label>
        {urls.length > 0 && (
          <span className="text-[10px] text-ink-40">{urls.length} URL{urls.length !== 1 ? "s" : ""}</span>
        )}
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder={"https://competitor1.com/page\nhttps://competitor2.com/page"}
        rows={3}
        className="w-full border-[1.5px] border-line rounded-[14px] bg-white text-ink px-4 py-3 font-mono text-[13px] outline-none transition-all duration-150 focus:border-ink focus:shadow-[4px_4px_0_0_var(--ink)] resize-none"
      />
    </div>
  );
}
