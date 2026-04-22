"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/shared/Button";
import { LocationsList } from "@/components/locations/LocationsList";
import { LocationEditor } from "@/components/locations/LocationEditor";

export default function LocationsPage() {
  const [brands, setBrands] = useState<any[]>([]);
  const [brandId, setBrandId] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [adding, setAdding] = useState(false);
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
            setBrandId(data[0].id);
          }
        }
      } catch {
        // brands not available
      }
    }
    loadBrands();
  }, []);

  // Load locations when brand changes
  const loadLocations = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/locations?brand_id=${id}`);
      if (res.ok) {
        setLocations(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (brandId) loadLocations(brandId);
  }, [brandId, loadLocations]);

  async function handleSave(data: any) {
    if (selected) {
      // Update
      const res = await apiFetch(`/api/locations/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setLocations((prev) =>
          prev.map((l) => (l.id === updated.id ? updated : l))
        );
        setSelected(null);
      }
    } else {
      // Create
      const res = await apiFetch("/api/locations", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created = await res.json();
        setLocations((prev) => [created, ...prev]);
        setAdding(false);
      }
    }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/locations/${id}`, { method: "DELETE" });
    setLocations((prev) => prev.filter((l) => l.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function handleSelect(loc: any) {
    setAdding(false);
    setSelected(loc);
  }

  function handleCancel() {
    setSelected(null);
    setAdding(false);
  }

  function handleAdd() {
    setSelected(null);
    setAdding(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-[800] text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.035em] m-0">
          Locations
        </h1>
        <p className="text-[13px] text-ink-70 mt-2">
          Manage service locations and local context for hyper-local content generation.
        </p>
      </div>

      {/* Brand selector + Add button */}
      <div className="flex items-end gap-4 max-[600px]:flex-col max-[600px]:items-stretch">
        <div>
          <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">
            Brand
          </label>
          <select
            value={brandId}
            onChange={(e) => {
              const brand = brands.find((b) => b.id === e.target.value);
              if (brand) {
                setBrandId(brand.id);
                setSelected(null);
                setAdding(false);
              }
            }}
            className="w-full max-w-[400px] h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] font-mono text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] appearance-none cursor-pointer"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="ink" size="sm" onClick={handleAdd}>
          + Add location
        </Button>
      </div>

      {/* Locations list */}
      {loading ? (
        <div className="text-[13px] text-ink-40 animate-pulse">
          Loading locations...
        </div>
      ) : (
        <LocationsList
          locations={locations}
          selectedId={selected?.id || null}
          onSelect={handleSelect}
          onDelete={handleDelete}
        />
      )}

      {/* Editor */}
      {(selected || adding) && (
        <LocationEditor
          location={selected || null}
          brandId={brandId}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
