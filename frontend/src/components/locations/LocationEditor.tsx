"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/shared/Button";
import { apiFetch } from "@/lib/api";

interface Review {
  author: string;
  text: string;
  rating: number;
}

interface LocationEditorProps {
  location: any;
  brandId: string;
  brandName: string;
  onSave: (data: any) => void;
  onCancel: () => void;
}

const labelClass = "block text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-1.5";
const inputClass = "w-full h-10 border-[1.5px] border-line rounded-lg bg-white text-ink px-3 text-[13px] outline-none focus:border-ink transition-colors";
const textareaClass = "w-full border-[1.5px] border-line rounded-lg bg-white text-ink px-3 py-2.5 text-[13px] leading-[1.6] outline-none focus:border-ink transition-colors resize-y";

export function LocationEditor({ location, brandId, brandName, onSave, onCancel }: LocationEditorProps) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [slug, setSlug] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [teamLead, setTeamLead] = useState("");
  const [neighborhoods, setNeighborhoods] = useState("");
  const [commonJob, setCommonJob] = useState("");
  const [localChallenge, setLocalChallenge] = useState("");
  const [funFact, setFunFact] = useState("");
  const [competitorsToAvoid, setCompetitorsToAvoid] = useState("");
  const [certifications, setCertifications] = useState("");
  const [climateNotes, setClimateNotes] = useState("");
  const [housingNotes, setHousingNotes] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [importMessage, setImportMessage] = useState("");

  useEffect(() => {
    if (location) {
      setName(location.name || "");
      setCity(location.city || "");
      setState(location.state || "");
      setSlug(location.slug || "");
      const ctx = location.local_context || {};
      setTeamLead(ctx.team_lead || "");
      setNeighborhoods(Array.isArray(ctx.neighborhoods) ? ctx.neighborhoods.join(", ") : ctx.neighborhoods || "");
      setCommonJob(ctx.common_job || "");
      setLocalChallenge(ctx.local_challenge || "");
      setFunFact(ctx.fun_fact || "");
      setCompetitorsToAvoid(Array.isArray(ctx.competitors_to_avoid) ? ctx.competitors_to_avoid.join(", ") : ctx.competitors_to_avoid || "");
      setCertifications(Array.isArray(ctx.certifications) ? ctx.certifications.join(", ") : ctx.certifications || "");
      setClimateNotes(ctx.climate_notes || "");
      setHousingNotes(ctx.housing_notes || "");
      setGeneralNotes(ctx.general_notes || "");
      setReviews(ctx.reviews || []);
      if (ctx.team_lead || ctx.neighborhoods || ctx.common_job || ctx.local_challenge || ctx.fun_fact || ctx.climate_notes || ctx.housing_notes) {
        setAdditionalOpen(true);
      }
    } else {
      setName(""); setCity(""); setState(""); setSlug("");
      setReviews([]); setTeamLead(""); setNeighborhoods(""); setCommonJob("");
      setLocalChallenge(""); setFunFact(""); setCompetitorsToAvoid("");
      setCertifications(""); setClimateNotes(""); setHousingNotes("");
      setAdditionalOpen(false); setImportMessage("");
    }
  }, [location]);

  function commaToArray(val: string): string[] {
    return val.split(",").map(s => s.trim()).filter(Boolean);
  }

  async function searchGoogle() {
    if (!city || !state) return;
    setSearching(true);
    setSearchResults([]);
    setImportMessage("");
    try {
      const res = await apiFetch("/api/locations/google-search", {
        method: "POST",
        body: JSON.stringify({ business_name: name || brandName, city, state }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {} finally {
      setSearching(false);
    }
  }

  function importResult(result: any) {
    const newReviews = (result.reviews || []).filter((r: any) => r.text).map((r: any) => ({
      author: r.author || "Customer",
      text: r.text,
      rating: r.rating || 5,
    }));
    setReviews(prev => [...prev, ...newReviews]);
    if (!name && result.title) setName(result.title);
    setSearchResults([]);
    if (newReviews.length > 0) {
      setImportMessage(`Imported ${newReviews.length} review${newReviews.length !== 1 ? "s" : ""} from ${result.title}`);
    } else {
      setImportMessage(`Found ${result.title} but no reviews available.`);
    }
  }

  function removeReview(index: number) {
    setReviews(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const local_context: any = { reviews };
      if (teamLead) local_context.team_lead = teamLead;
      if (neighborhoods) local_context.neighborhoods = commaToArray(neighborhoods);
      if (commonJob) local_context.common_job = commonJob;
      if (localChallenge) local_context.local_challenge = localChallenge;
      if (funFact) local_context.fun_fact = funFact;
      if (competitorsToAvoid) local_context.competitors_to_avoid = commaToArray(competitorsToAvoid);
      if (certifications) local_context.certifications = commaToArray(certifications);
      if (climateNotes) local_context.climate_notes = climateNotes;
      if (housingNotes) local_context.housing_notes = housingNotes;
      if (generalNotes) local_context.general_notes = generalNotes;

      const payload: any = {
        name: name || `${brandName} ${city}`,
        city, state, slug, local_context,
      };
      if (!location) payload.brand_id = brandId;
      onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-[1.5px] border-ink rounded-[18px] bg-white overflow-hidden">
      <div className="px-6 py-5 border-b-[1.5px] border-ink flex items-center justify-between">
        <h2 className="font-display font-[800] text-xl tracking-[-0.02em] m-0">
          {location ? "Edit" : "Add"} <span className="font-display font-normal text-pulp-deep">location</span>
        </h2>
        <Button variant="light" size="sm" onClick={onCancel}>Cancel</Button>
      </div>

      <div className="p-6 space-y-5">
        {/* DBA Name + City/State */}
        <div className="grid grid-cols-[2fr_1fr_80px] gap-3 max-[820px]:grid-cols-1">
          <div>
            <label className={labelClass}>DBA / Display name</label>
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="USAI Columbus" />
          </div>
          <div>
            <label className={labelClass}>City</label>
            <input className={inputClass} value={city} onChange={e => setCity(e.target.value)} placeholder="Columbus" />
          </div>
          <div>
            <label className={labelClass}>State</label>
            <input className={inputClass} value={state} onChange={e => setState(e.target.value)} placeholder="OH" />
          </div>
        </div>

        {/* Google search */}
        {city && state && (
          <div className="bg-[#F3F1ED] rounded-[14px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-ink-70">
                {importMessage || "Pull reviews from Google"}
              </span>
              <Button variant="ink" size="sm" onClick={() => { setImportMessage(""); searchGoogle(); }} disabled={searching}>
                {searching ? "Searching..." : importMessage ? "Search again" : "Search Google"}
              </Button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((r, i) => (
                  <div key={i} className="bg-white border border-line rounded-lg p-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-[800] text-[13px]">{r.title}</div>
                      <div className="text-[11px] text-ink-40">{r.address}</div>
                      {r.rating && <div className="text-[11px] text-ink-70">{r.rating}/5 ({r.total_reviews} reviews)</div>}
                      {r.reviews?.length > 0 && (
                        <div className="text-[11px] text-[#1F7A3A] mt-0.5">{r.reviews.length} reviews to import</div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => importResult(r)}>Import</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reviews */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelClass}>Reviews ({reviews.length})</label>
            <button onClick={() => setReviews(prev => [...prev, { author: "", text: "", rating: 5 }])}
              className="text-[11px] text-ink-70 hover:text-ink transition-colors cursor-pointer bg-transparent border-0 p-0">
              + Add manually
            </button>
          </div>
          {reviews.length === 0 ? (
            <div className="text-[12px] text-ink-40 py-3">No reviews yet. Import from Google or add manually.</div>
          ) : (
            <div className="space-y-2">
              {reviews.map((r, i) => (
                <div key={i} className="border border-line rounded-lg p-3">
                  {r.text ? (
                    <div className="flex gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-ink leading-[1.5]">"{r.text}"</div>
                        <div className="text-[11px] text-ink-40 mt-1">{r.author}</div>
                      </div>
                      <button onClick={() => removeReview(i)} className="text-[11px] text-ink-40 hover:text-[#b91c1c] shrink-0">Remove</button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input className={inputClass} placeholder="Review text" value={r.text} onChange={e => {
                        const updated = [...reviews]; updated[i] = { ...r, text: e.target.value }; setReviews(updated);
                      }} />
                      <div className="flex gap-2">
                        <input className={`${inputClass} max-w-[200px]`} placeholder="Author" value={r.author} onChange={e => {
                          const updated = [...reviews]; updated[i] = { ...r, author: e.target.value }; setReviews(updated);
                        }} />
                        <button onClick={() => removeReview(i)} className="text-[11px] text-ink-40 hover:text-[#b91c1c]">Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Additional info toggle */}
        <button onClick={() => setAdditionalOpen(!additionalOpen)}
          className="flex items-center gap-2 text-[12px] text-ink-70 hover:text-ink transition-colors cursor-pointer bg-transparent border-0 p-0">
          <span className="text-[14px] leading-none">{additionalOpen ? "-" : "+"}</span>
          {additionalOpen ? "Hide additional information" : "Add additional information"}
        </button>

        {additionalOpen && (
          <div className="space-y-3 pl-4 border-l-[1.5px] border-line">
            <div className="grid grid-cols-2 gap-3 max-[820px]:grid-cols-1">
              <div><label className={labelClass}>Team lead</label><input className={inputClass} value={teamLead} onChange={e => setTeamLead(e.target.value)} placeholder="Mike Johnson, 12 years experience" /></div>
              <div><label className={labelClass}>Neighborhoods (comma-separated)</label><input className={inputClass} value={neighborhoods} onChange={e => setNeighborhoods(e.target.value)} placeholder="Clintonville, German Village" /></div>
              <div><label className={labelClass}>Most common job type</label><input className={inputClass} value={commonJob} onChange={e => setCommonJob(e.target.value)} placeholder="1950s homes with no wall insulation" /></div>
              <div><label className={labelClass}>Local challenge</label><input className={inputClass} value={localChallenge} onChange={e => setLocalChallenge(e.target.value)} placeholder="Extreme temperature swings" /></div>
              <div><label className={labelClass}>Local connection</label><input className={inputClass} value={funFact} onChange={e => setFunFact(e.target.value)} placeholder="Sponsor of the Columbus Crew" /></div>
              <div><label className={labelClass}>Certifications (comma-separated)</label><input className={inputClass} value={certifications} onChange={e => setCertifications(e.target.value)} placeholder="BPI Certified, Energy Star" /></div>
              <div><label className={labelClass}>Competitors to avoid (comma-separated)</label><input className={inputClass} value={competitorsToAvoid} onChange={e => setCompetitorsToAvoid(e.target.value)} placeholder="RetroFoam, ABC Insulation" /></div>
              <div><label className={labelClass}>Climate notes</label><input className={inputClass} value={climateNotes} onChange={e => setClimateNotes(e.target.value)} placeholder="Hot summers, cold winters" /></div>
            </div>
            <div><label className={labelClass}>Housing stock</label><input className={inputClass} value={housingNotes} onChange={e => setHousingNotes(e.target.value)} placeholder="Mostly 1950s ranch and colonial" /></div>
            <div>
              <label className={labelClass}>General notes</label>
              <textarea className={textareaClass} value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} placeholder="Any other details about this location that should inform content..." rows={3} />
            </div>
          </div>
        )}

        {/* Save */}
        <div className="flex gap-2 pt-2">
          <Button variant="ink" size="sm" onClick={handleSave} disabled={saving || !city || !state}>
            {saving ? "Saving..." : location ? "Save changes" : "Add location"}
          </Button>
        </div>
      </div>
    </div>
  );
}
