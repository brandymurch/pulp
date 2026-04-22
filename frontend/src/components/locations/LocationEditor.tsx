"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/shared/Button";
import { Input } from "@/components/shared/Input";
import { apiFetch } from "@/lib/api";

interface Review {
  author: string;
  text: string;
  rating: number;
}

interface LocalContext {
  team_lead: string;
  neighborhoods: string;
  common_job: string;
  local_challenge: string;
  fun_fact: string;
  competitors_to_avoid: string;
  certifications: string;
  climate_notes: string;
  housing_notes: string;
  reviews: Review[];
}

interface LocationEditorProps {
  location: any; // null for new
  brandId: string;
  brandName: string;
  onSave: (data: any) => void;
  onCancel: () => void;
}

function emptyContext(): LocalContext {
  return {
    team_lead: "",
    neighborhoods: "",
    common_job: "",
    local_challenge: "",
    fun_fact: "",
    competitors_to_avoid: "",
    certifications: "",
    climate_notes: "",
    housing_notes: "",
    reviews: [],
  };
}

function parseArrayToComma(val: any): string {
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "string") return val;
  return "";
}

function commaToArray(val: string): string[] {
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function LocationEditor({ location, brandId, brandName, onSave, onCancel }: LocationEditorProps) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("draft");
  const [ctx, setCtx] = useState<LocalContext>(emptyContext());
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    if (location) {
      setName(location.name || "");
      setCity(location.city || "");
      setState(location.state || "");
      setSlug(location.slug || "");
      setStatus(location.status || "draft");

      const lc = location.local_context || {};
      setCtx({
        team_lead: lc.team_lead || "",
        neighborhoods: parseArrayToComma(lc.neighborhoods),
        common_job: lc.common_job || "",
        local_challenge: lc.local_challenge || "",
        fun_fact: lc.fun_fact || "",
        competitors_to_avoid: parseArrayToComma(lc.competitors_to_avoid),
        certifications: parseArrayToComma(lc.certifications),
        climate_notes: lc.climate_notes || "",
        housing_notes: lc.housing_notes || "",
        reviews: Array.isArray(lc.reviews) ? lc.reviews : [],
      });
    } else {
      setName("");
      setCity("");
      setState("");
      setSlug("");
      setStatus("draft");
      setCtx(emptyContext());
    }
  }, [location]);

  function updateCtx(key: keyof LocalContext, value: any) {
    setCtx((prev) => ({ ...prev, [key]: value }));
  }

  async function searchGoogle() {
    if (!city || !state) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await apiFetch("/api/locations/google-search", {
        method: "POST",
        body: JSON.stringify({ business_name: brandName, city, state }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {
      // search failed
    } finally {
      setSearching(false);
    }
  }

  function importResult(result: any) {
    // Import reviews
    const reviews = (result.reviews || []).filter((r: any) => r.text).map((r: any) => ({
      author: r.author || "Customer",
      text: r.text,
      rating: r.rating || 5,
    }));

    setCtx(prev => ({
      ...prev,
      reviews: [...prev.reviews, ...reviews],
    }));
    setSearchResults([]);
  }

  function addReview() {
    setCtx((prev) => ({
      ...prev,
      reviews: [...prev.reviews, { author: "", text: "", rating: 5 }],
    }));
  }

  function updateReview(index: number, field: keyof Review, value: any) {
    setCtx((prev) => ({
      ...prev,
      reviews: prev.reviews.map((r, i) =>
        i === index ? { ...r, [field]: value } : r
      ),
    }));
  }

  function removeReview(index: number) {
    setCtx((prev) => ({
      ...prev,
      reviews: prev.reviews.filter((_, i) => i !== index),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        brand_id: brandId,
        name,
        city,
        state,
        slug,
        status,
        local_context: {
          team_lead: ctx.team_lead,
          neighborhoods: commaToArray(ctx.neighborhoods),
          common_job: ctx.common_job,
          local_challenge: ctx.local_challenge,
          fun_fact: ctx.fun_fact,
          competitors_to_avoid: commaToArray(ctx.competitors_to_avoid),
          certifications: commaToArray(ctx.certifications),
          climate_notes: ctx.climate_notes,
          housing_notes: ctx.housing_notes,
          reviews: ctx.reviews,
        },
      };
      onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  const labelClass = "block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2";
  const textareaClass =
    "w-full border-[1.5px] border-ink rounded-[14px] bg-white text-ink px-4 py-3 font-mono text-[13px] leading-[1.6] outline-none resize-y focus:shadow-[4px_4px_0_0_var(--ink)]";

  return (
    <div className="border-[1.5px] border-ink rounded-[18px] bg-white overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b-[1.5px] border-ink">
        <h2 className="font-display font-[800] text-xl tracking-[-0.02em] m-0">
          {location ? "Edit" : "New"}{" "}
          <span className="font-display italic font-normal">location</span>
        </h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Basic info row */}
        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-3">
            Basic info
          </div>
          <div className="grid grid-cols-[1fr_1fr_100px_1fr_140px] gap-4 max-[820px]:grid-cols-1">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Austin South"
            />
            <Input
              label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Austin"
            />
            <Input
              label="State"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="TX"
            />
            <Input
              label="Slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="austin-south"
            />
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] font-mono text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] appearance-none cursor-pointer"
              >
                <option value="draft">Draft</option>
                <option value="live">Live</option>
                <option value="stale">Stale</option>
              </select>
            </div>
          </div>
        </div>

        {/* Google Search */}
        {city && state && (
          <div className="border-[1.5px] border-line rounded-[14px] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40">
                Pull from Google
              </div>
              <Button variant="ink" size="sm" onClick={searchGoogle} disabled={searching}>
                {searching ? "Searching..." : `Search "${brandName} ${city}"`}
              </Button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((r, i) => (
                  <div key={i} className="border border-line rounded-[10px] p-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-[800] text-[13px]">{r.title}</div>
                      <div className="text-[11px] text-ink-40 mt-0.5">{r.address}</div>
                      {r.rating && <div className="text-[11px] text-ink-70 mt-0.5">Rating: {r.rating}/5 ({r.total_reviews} reviews)</div>}
                      {r.reviews && r.reviews.length > 0 && (
                        <div className="text-[11px] text-ink-40 mt-1">{r.reviews.length} reviews available to import</div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => importResult(r)}>
                      Import
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Local context */}
        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-3">
            Local context
          </div>
          <div className="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">
            <Input
              label="Team lead"
              value={ctx.team_lead}
              onChange={(e) => updateCtx("team_lead", e.target.value)}
              placeholder="Mike R."
            />
            <Input
              label="Neighborhoods (comma-separated)"
              value={ctx.neighborhoods}
              onChange={(e) => updateCtx("neighborhoods", e.target.value)}
              placeholder="South Congress, Zilker, Barton Hills"
            />
            <Input
              label="Common job"
              value={ctx.common_job}
              onChange={(e) => updateCtx("common_job", e.target.value)}
              placeholder="Attic insulation upgrade"
            />
            <Input
              label="Local challenge"
              value={ctx.local_challenge}
              onChange={(e) => updateCtx("local_challenge", e.target.value)}
              placeholder="Extreme summer heat"
            />
            <Input
              label="Fun fact"
              value={ctx.fun_fact}
              onChange={(e) => updateCtx("fun_fact", e.target.value)}
              placeholder="Team sponsors local 5K run"
            />
            <Input
              label="Competitors to avoid (comma-separated)"
              value={ctx.competitors_to_avoid}
              onChange={(e) => updateCtx("competitors_to_avoid", e.target.value)}
              placeholder="AcmeCo, BigInsulate"
            />
            <Input
              label="Certifications (comma-separated)"
              value={ctx.certifications}
              onChange={(e) => updateCtx("certifications", e.target.value)}
              placeholder="BPI Certified, ENERGY STAR Partner"
            />
            <div>
              <label className={labelClass}>Climate notes</label>
              <textarea
                value={ctx.climate_notes}
                onChange={(e) => updateCtx("climate_notes", e.target.value)}
                placeholder="Hot summers, mild winters. Cooling costs dominate."
                rows={3}
                className={textareaClass}
              />
            </div>
            <div>
              <label className={labelClass}>Housing notes</label>
              <textarea
                value={ctx.housing_notes}
                onChange={(e) => updateCtx("housing_notes", e.target.value)}
                placeholder="Mix of 1970s ranch homes and new construction."
                rows={3}
                className={textareaClass}
              />
            </div>
          </div>
        </div>

        {/* Reviews */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40">
              Reviews ({ctx.reviews.length})
            </div>
            <Button variant="ghost" size="sm" onClick={addReview}>
              + Add review
            </Button>
          </div>

          {ctx.reviews.length === 0 && (
            <div className="text-[13px] text-ink-40 py-4 text-center">
              No reviews added. Click &quot;+ Add review&quot; to include customer testimonials.
            </div>
          )}

          <div className="space-y-3">
            {ctx.reviews.map((review, idx) => (
              <div
                key={idx}
                className="border-[1.5px] border-line rounded-[14px] p-4 space-y-3"
              >
                <div className="grid grid-cols-[1fr_80px_auto] gap-3 items-end max-[820px]:grid-cols-1">
                  <Input
                    label="Author"
                    value={review.author}
                    onChange={(e) => updateReview(idx, "author", e.target.value)}
                    placeholder="Jane D."
                  />
                  <div>
                    <label className={labelClass}>Rating</label>
                    <select
                      value={review.rating}
                      onChange={(e) =>
                        updateReview(idx, "rating", Number(e.target.value))
                      }
                      className="w-full h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] font-mono text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] appearance-none cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => removeReview(idx)}
                    className="h-[46px] text-[11px] text-ink-40 hover:text-[#b91c1c] transition-colors px-2"
                  >
                    Remove
                  </button>
                </div>
                <div>
                  <label className={labelClass}>Review text</label>
                  <textarea
                    value={review.text}
                    onChange={(e) => updateReview(idx, "text", e.target.value)}
                    placeholder="Great service, very professional..."
                    rows={2}
                    className={textareaClass}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 items-center pt-2">
          <Button variant="ink" onClick={handleSave} disabled={saving || !name}>
            {saving ? "Saving..." : location ? "Save changes" : "Create location"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
