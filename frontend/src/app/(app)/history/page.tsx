"use client";
import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiFetchOk } from "@/lib/api";
import type { Generation } from "@/lib/types";
import { GenerationsList } from "@/components/history/GenerationsList";
import { GenerationDetail } from "@/components/history/GenerationDetail";

export default function HistoryPage() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selected, setSelected] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/generations");
      if (res.ok) {
        const data = await res.json();
        setGenerations(data);
        setError(null);
      } else {
        setError("Failed to load generations. Refresh the page to try again.");
      }
    } catch (err) {
      console.error("Failed to load generations:", err);
      setError("Failed to load generations. Refresh the page to try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    try {
      await apiFetchOk(`/api/generations/${id}`, { method: "DELETE" });
      setGenerations(prev => prev.filter(g => g.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      console.error("Failed to delete generation:", err);
      setError("Failed to delete the generation. Try again.");
    }
  }

  async function handleSelect(gen: Generation) {
    // Fetch full detail
    try {
      const res = await apiFetchOk(`/api/generations/${gen.id}`);
      const full = await res.json();
      setSelected(full);
      setError(null);
    } catch (err) {
      console.error("Failed to load generation detail:", err);
      setError("Failed to load that generation. Try again.");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display font-[800] text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.035em] m-0">
        History
      </h1>

      {error && (
        <div className="border-[1.5px] border-[#b91c1c] rounded-[14px] px-5 py-3 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
          {error}
        </div>
      )}

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
