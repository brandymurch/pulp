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

                {/* Add form at the top */}
                {addingForBrand?.id === brand.id && (
                  <div className="mb-4">
                    <LocationEditor
                      location={null}
                      brandId={brand.id}
                      brandName={brand.name}
                      onSave={(data) => handleSave(brand.id, data)}
                      onCancel={() => setAddingForBrand(null)}
                    />
                  </div>
                )}

                {/* Locations for this brand */}
                {locs.length === 0 && !addingForBrand ? (
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
                        <div key={loc.id}>
                          <div
                            onClick={() => { setAddingForBrand(null); setSelected(isSelected ? null : loc); }}
                            className={`flex items-center justify-between px-5 py-3 cursor-pointer transition-colors ${
                              i < locs.length - 1 && !isSelected ? "border-b border-line" : ""
                            } ${isSelected ? "bg-[#F3F1ED]" : "hover:bg-[#F3F1ED]"}`}
                          >
                            <div>
                              <div className="font-display font-[800] text-[14px] tracking-[-0.01em]">
                                {loc.name || `${brand.name} ${loc.city}`}, {loc.state}
                              </div>
                              <div className="text-[11px] text-ink-40">
                                {reviewCount > 0 && `${reviewCount} review${reviewCount !== 1 ? "s" : ""}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-[11px] text-ink-40">
                                {isSelected ? "Close" : "Details"}
                              </span>
                              <button
                                onClick={e => { e.stopPropagation(); handleDelete(brand.id, loc.id); }}
                                className="text-[11px] text-[#b91c1c]/50 hover:text-[#b91c1c] transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          {/* Editor inline under selected location */}
                          {isSelected && (
                            <div className="p-4 border-b border-line bg-[#F3F1ED]/50">
                              <div className="mb-3">
                                <a
                                  href={`/generate?brand=${brand.id}&location=${loc.id}`}
                                  className="inline-flex items-center justify-center gap-2 h-8 px-3.5 text-[11px] font-medium tracking-[0.04em] rounded-full border-[1.5px] bg-ink text-white border-ink transition-all hover:-translate-y-px hover:bg-pulp hover:text-ink hover:border-pulp"
                                >
                                  Create new page
                                </a>
                              </div>
                              <LocationEditor
                                location={selected}
                                brandId={brand.id}
                                brandName={brand.name}
                                onSave={(data) => handleSave(brand.id, data)}
                                onCancel={() => setSelected(null)}
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
          })}
        </div>
      )}
    </div>
  );
}
