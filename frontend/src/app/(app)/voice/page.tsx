"use client";
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { VoiceTuner } from "@/components/voice/VoiceTuner";
import { StyleExamplesList } from "@/components/voice/StyleExamplesList";
import { AddStyleExample } from "@/components/voice/AddStyleExample";

export default function VoicePage() {
  const [brands, setBrands] = useState<any[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<any>(null);
  const [brandId, setBrandId] = useState("");
  const [brandName, setBrandName] = useState("");
  const [examples, setExamples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Load brands on mount
  useEffect(() => {
    async function loadBrands() {
      try {
        const res = await apiFetch("/api/brands");
        if (res.ok) {
          const data = await res.json();
          setBrands(data);
          if (data.length > 0) {
            setSelectedBrand(data[0]);
            setBrandId(data[0].id);
            setBrandName(data[0].name);
          }
        }
      } catch {
        // brands not available
      }
    }
    loadBrands();
  }, []);

  // Load examples when brand changes
  const loadExamples = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/style-examples?brand_id=${id}`);
      if (res.ok) {
        setExamples(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (brandId) loadExamples(brandId);
  }, [brandId, loadExamples]);

  async function handleAdd(data: { title: string; content: string; url?: string }) {
    const res = await apiFetch("/api/style-examples", {
      method: "POST",
      body: JSON.stringify({ ...data, brand_id: brandId }),
    });
    if (res.ok) {
      const created = await res.json();
      setExamples(prev => [created, ...prev]);
    }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/style-examples/${id}`, { method: "DELETE" });
    setExamples(prev => prev.filter(e => e.id !== id));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-[800] text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.035em] m-0">
          Voice
        </h1>
        <p className="text-[13px] text-ink-70 mt-2">
          Add samples of copy you love. Pulp uses these to match your brand voice.
        </p>
      </div>

      {/* Brand selector */}
      <div>
        <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">Brand</label>
        <select
          value={brandId}
          onChange={e => {
            const brand = brands.find(b => b.id === e.target.value);
            if (brand) {
              setSelectedBrand(brand);
              setBrandId(brand.id);
              setBrandName(brand.name);
            }
          }}
          className="w-full max-w-[400px] h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] font-mono text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] appearance-none cursor-pointer"
        >
          {brands.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Voice tuner */}
      {selectedBrand && (
        <VoiceTuner
          brand={selectedBrand}
          onSave={(updated) => {
            setSelectedBrand(updated);
            setBrands(prev => prev.map(b => b.id === updated.id ? updated : b));
          }}
        />
      )}

      {/* Style examples */}
      {loading ? (
        <div className="text-[13px] text-ink-40 animate-pulse">Loading style examples...</div>
      ) : (
        <>
          <AddStyleExample onAdd={handleAdd} />
          <div className="mt-2">
            <h2 className="font-display font-[800] text-xl tracking-[-0.02em] mb-4">
              {brandName} <span className="font-display italic font-normal">examples</span>
              <span className="text-[10px] tracking-[0.22em] uppercase text-ink-40 ml-3 font-mono font-normal">{examples.length} total</span>
            </h2>
            <StyleExamplesList examples={examples} onDelete={handleDelete} />
          </div>
        </>
      )}
    </div>
  );
}
