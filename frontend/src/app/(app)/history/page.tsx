"use client";
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { GenerationsList } from "@/components/history/GenerationsList";
import { GenerationDetail } from "@/components/history/GenerationDetail";

export default function HistoryPage() {
  const [generations, setGenerations] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      // Get brand ID
      const brandsRes = await apiFetch("/api/brands");
      if (!brandsRes.ok) return;
      const brands = await brandsRes.json();
      if (brands.length === 0) return;

      const res = await apiFetch(`/api/generations?brand_id=${brands[0].id}`);
      if (res.ok) {
        const data = await res.json();
        setGenerations(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    await apiFetch(`/api/generations/${id}`, { method: "DELETE" });
    setGenerations(prev => prev.filter(g => g.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  async function handleSelect(gen: any) {
    // Fetch full detail
    const res = await apiFetch(`/api/generations/${gen.id}`);
    if (res.ok) {
      const full = await res.json();
      setSelected(full);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display font-[800] text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.035em] m-0">
        History
      </h1>

      {loading ? (
        <div className="text-[13px] text-ink-40 animate-pulse">Loading generations...</div>
      ) : (
        <>
          <GenerationsList
            generations={generations}
            selectedId={selected?.id || null}
            onSelect={handleSelect}
            onDelete={handleDelete}
          />
          {selected && (
            <GenerationDetail generation={selected} onClose={() => setSelected(null)} />
          )}
        </>
      )}
    </div>
  );
}
