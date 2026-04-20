"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

interface Template {
  id: string;
  name: string;
  page_type: string;
  brand: string;
}

interface TemplateSelectorProps {
  brandName: string;
  selectedId: string;
  onSelect: (template: Template | null) => void;
}

export function TemplateSelector({ brandName, selectedId, onSelect }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!brandName) {
        setLoading(false);
        return;
      }
      try {
        const res = await apiFetch(`/api/notion/templates?brand=${encodeURIComponent(brandName)}`);
        if (res.ok) {
          const data = await res.json();
          setTemplates(data);
        }
      } catch {
        // Notion not configured, show empty
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [brandName]);

  return (
    <div>
      <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">Template</label>
      <select
        value={selectedId}
        onChange={e => {
          const found = templates.find(t => t.id === e.target.value) || null;
          onSelect(found);
        }}
        className="w-full h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] font-mono text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] appearance-none cursor-pointer"
        disabled={loading}
      >
        <option value="">{loading ? "Loading templates..." : "Select a template"}</option>
        {templates.map(t => (
          <option key={t.id} value={t.id}>{t.name} ({t.page_type})</option>
        ))}
      </select>
    </div>
  );
}
