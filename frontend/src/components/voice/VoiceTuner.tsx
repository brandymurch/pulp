"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/shared/Button";
import { apiFetch } from "@/lib/api";

interface VoiceDimension {
  key: string;
  value: number;
}

interface VoiceTunerProps {
  brand: any;
  onSave: (updated: any) => void;
}

const labelClass = "block text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-1.5";
const inputClass = "w-full h-10 border-[1.5px] border-line rounded-lg bg-white text-ink px-3 font-mono text-[13px] outline-none focus:border-ink transition-colors";
const textareaClass = "w-full border-[1.5px] border-line rounded-lg bg-white text-ink px-3 py-2.5 font-mono text-[13px] leading-[1.6] outline-none focus:border-ink transition-colors resize-y";

export function VoiceTuner({ brand, onSave }: VoiceTunerProps) {
  const [dimensions, setDimensions] = useState<VoiceDimension[]>([]);
  const [notes, setNotes] = useState("");
  const [bannedWords, setBannedWords] = useState("");
  const [services, setServices] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!brand) return;
    const dims = brand.voice_dimensions;
    setDimensions(
      Array.isArray(dims) && dims.length > 0 ? dims : [
        { key: "Warmth", value: 50 },
        { key: "Wit", value: 50 },
        { key: "Formality", value: 50 },
        { key: "Local color", value: 50 },
        { key: "Sales-y", value: 50 },
      ]
    );
    setNotes(brand.voice_notes || "");
    setBannedWords((brand.brand_banned_words || []).join(", "));
    setServices((brand.services || []).join("\n"));
    setGuidelines(brand.brand_guidelines || "");
    setSaved(false);
  }, [brand]);

  function markDirty() { setSaved(false); }

  async function handleSave() {
    setSaving(true);
    try {
      const words = bannedWords.split(",").map(w => w.trim()).filter(Boolean);
      const svcList = services.split("\n").map(s => s.trim()).filter(Boolean);
      const res = await apiFetch(`/api/brands/${brand.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          voice_dimensions: dimensions,
          voice_notes: notes,
          brand_banned_words: words,
          services: svcList,
          brand_guidelines: guidelines,
        }),
      });
      if (res.ok) {
        onSave(await res.json());
        setSaved(true);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!brand) return null;

  const lockedClass = !editing ? " opacity-70 pointer-events-none" : "";

  return (
    <div className="space-y-6">
      {/* Edit toggle */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40">
          {editing ? "Editing voice settings" : "Voice settings (locked)"}
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-[11px] text-ink-70 hover:text-ink transition-colors cursor-pointer bg-transparent border-0 p-0 underline">
            Edit
          </button>
        )}
      </div>

      {/* Tone sliders */}
      <div className={lockedClass}>
        <label className={labelClass}>Tone dimensions</label>
        <div className="space-y-3 mt-2">
          {dimensions.map(dim => (
            <div key={dim.key} className="flex items-center gap-3">
              <span className="text-[11px] text-ink-70 w-[100px] shrink-0">{dim.key}</span>
              <input
                type="range" min={0} max={100} value={dim.value}
                disabled={!editing}
                onChange={e => {
                  setDimensions(prev => prev.map(d => d.key === dim.key ? { ...d, value: Number(e.target.value) } : d));
                  markDirty();
                }}
                className="flex-1 h-1.5 appearance-none bg-line rounded-full accent-ink cursor-pointer"
              />
              <span className="text-[12px] font-mono text-ink-40 w-8 text-right">{dim.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Voice instructions */}
      <div className={lockedClass}>
        <label className={labelClass}>Voice instructions</label>
        <textarea className={textareaClass} value={notes} disabled={!editing} onChange={e => { setNotes(e.target.value); markDirty(); }} placeholder="Never use exclamation marks. Keep sentences under 20 words." rows={3} />
      </div>

      {/* Brand guidelines */}
      <div className={lockedClass}>
        <label className={labelClass}>Brand guidelines</label>
        <textarea className={textareaClass} value={guidelines} disabled={!editing} onChange={e => { setGuidelines(e.target.value); markDirty(); }} placeholder={"Target audience: homeowners 30-65\nDo not mention competitors by name\nAlways include a free estimate CTA"} rows={4} />
        <div className="text-[10px] text-ink-40 mt-1">Rules, positioning, audience, things to avoid.</div>
      </div>

      {/* Services */}
      <div className={lockedClass}>
        <label className={labelClass}>Services (one per line)</label>
        <textarea className={textareaClass} value={services} disabled={!editing} onChange={e => { setServices(e.target.value); markDirty(); }} placeholder={"Injection Foam Insulation\nSpray Foam Insulation\nBlown-In Insulation"} rows={4} />
        <div className="text-[10px] text-ink-40 mt-1">Content will only reference these services.</div>
      </div>

      {/* Banned words */}
      <div className={lockedClass}>
        <label className={labelClass}>Banned words (comma-separated)</label>
        <textarea className={textareaClass} value={bannedWords} disabled={!editing} onChange={e => { setBannedWords(e.target.value); markDirty(); }} placeholder="leverage, utilize, robust" rows={2} />
        <div className="text-[10px] text-ink-40 mt-1">Added to the global banned words list for this brand.</div>
      </div>

      {/* Save / Cancel */}
      {editing && (
        <div className="flex gap-3 items-center">
          <Button variant="ink" size="sm" onClick={handleSave} disabled={saving || saved}>
            {saving ? "Saving..." : saved ? "Saved" : "Save settings"}
          </Button>
          <button onClick={() => setEditing(false)} className="text-[11px] text-ink-40 hover:text-ink transition-colors cursor-pointer bg-transparent border-0 p-0">
            Cancel
          </button>
          {saved && <span className="text-[11px] text-[#1F7A3A]">Updated</span>}
        </div>
      )}
    </div>
  );
}
