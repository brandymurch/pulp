"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/shared/Button";
import { LocationEditor } from "@/components/locations/LocationEditor";

export default function LocationsPage() {
  const [brands, setBrands] = useState<any[]>([]);
  const [allLocations, setAllLocations] = useState<Record<string, any[]>>({});
  const [selected, setSelected] = useState<any>(null);
  const [addingForBrand, setAddingForBrand] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Load brands and all locations on mount
  useEffect(() => {
    async function loadAll() {
      try {
        const brandsRes = await apiFetch("/api/brands");
        if (!brandsRes.ok) return;
        const brandsData = await brandsRes.json();
        setBrands(brandsData);

        // Load locations for each brand in parallel
        const locationsByBrand: Record<string, any[]> = {};
        await Promise.all(
          brandsData.map(async (brand: any) => {
            const res = await apiFetch(`/api/locations?brand_id=${brand.id}`);
            if (res.ok) {
              locationsByBrand[brand.id] = await res.json();
            } else {
              locationsByBrand[brand.id] = [];
            }
          })
        );
        setAllLocations(locationsByBrand);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  async function handleSave(brandId: string, data: any) {
    if (selected) {
      const res = await apiFetch(`/api/locations/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setAllLocations(prev => ({
          ...prev,
          [brandId]: (prev[brandId] || []).map(l => l.id === updated.id ? updated : l),
        }));
        setSelected(null);
      }
    } else {
      const res = await apiFetch("/api/locations", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created = await res.json();
        setAllLocations(prev => ({
          ...prev,
          [brandId]: [created, ...(prev[brandId] || [])],
        }));
        setAddingForBrand(null);
      }
    }
  }

  async function handleDelete(brandId: string, locationId: string) {
    await apiFetch(`/api/locations/${locationId}`, { method: "DELETE" });
    setAllLocations(prev => ({
      ...prev,
      [brandId]: (prev[brandId] || []).filter(l => l.id !== locationId),
    }));
    if (selected?.id === locationId) setSelected(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-[800] text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.035em] m-0">
          Locations
        </h1>
        <p className="text-[13px] text-ink-70 mt-2">
          Manage locations and local context per brand.
        </p>
      </div>

      {loading ? (
        <div className="text-[13px] text-ink-40 animate-pulse">Loading locations...</div>
      ) : (
        <div className="space-y-8">
          {brands.map(brand => {
            const locs = allLocations[brand.id] || [];
            return (
              <div key={brand.id}>
                {/* Brand header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="font-display font-[800] text-lg tracking-[-0.02em] m-0">
                      {brand.name}
                    </h2>
                    <span className="text-[10px] tracking-[0.22em] uppercase text-ink-40">
                      {locs.length} location{locs.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <Button variant="light" size="sm" onClick={() => { setSelected(null); setAddingForBrand(brand); }}>
                    + Add
                  </Button>
                </div>

                {/* Locations for this brand */}
                {locs.length === 0 ? (
                  <div className="text-[13px] text-ink-40 py-4 border-t border-line">
                    No locations yet.
                  </div>
                ) : (
                  <div className="border-t border-line">
                    {locs.map((loc, i) => {
                      const ctx = loc.local_context || {};
                      const reviewCount = (ctx.reviews || []).length;
                      const isSelected = selected?.id === loc.id;
                      return (
                        <div
                          key={loc.id}
                          onClick={() => { setAddingForBrand(null); setSelected(isSelected ? null : loc); }}
                          className={`flex items-center justify-between px-5 py-3 cursor-pointer transition-colors ${
                            i < locs.length - 1 ? "border-b border-line" : ""
                          } ${isSelected ? "bg-line-soft" : "hover:bg-line-soft"}`}
                        >
                          <div className="flex items-center gap-4">
                            <div>
                              <div className="font-display font-[800] text-[14px] tracking-[-0.01em]">
                                {loc.city}, <span className="font-display italic font-normal">{loc.state}</span>
                              </div>
                              {loc.slug && (
                                <div className="text-[11px] text-ink-40 font-mono">{loc.slug}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {reviewCount > 0 && (
                              <span className="text-[10px] text-ink-40">{reviewCount} review{reviewCount !== 1 ? "s" : ""}</span>
                            )}
                            <a
                              href={`/generate?brand=${brand.id}&location=${loc.id}`}
                              onClick={e => e.stopPropagation()}
                              className="text-[11px] text-ink-70 hover:text-ink transition-colors border-b border-line hover:border-ink pb-px"
                            >
                              Generate
                            </a>
                            <button
                              onClick={e => { e.stopPropagation(); handleDelete(brand.id, loc.id); }}
                              className="text-[11px] text-ink-40 hover:text-[#b91c1c] transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Editor for this brand */}
                {selected && locs.some(l => l.id === selected.id) && (
                  <div className="mt-4">
                    <LocationEditor
                      location={selected}
                      brandId={brand.id}
                      brandName={brand.name}
                      onSave={(data) => handleSave(brand.id, data)}
                      onCancel={() => setSelected(null)}
                    />
                  </div>
                )}

                {addingForBrand?.id === brand.id && (
                  <div className="mt-4">
                    <LocationEditor
                      location={null}
                      brandId={brand.id}
                      brandName={brand.name}
                      onSave={(data) => handleSave(brand.id, data)}
                      onCancel={() => setAddingForBrand(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
