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

export function VoiceTuner({ brand, onSave }: VoiceTunerProps) {
  const [dimensions, setDimensions] = useState<VoiceDimension[]>([]);
  const [notes, setNotes] = useState("");
  const [bannedWords, setBannedWords] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
  }, [brand]);

  function updateDimension(key: string, value: number) {
    setDimensions(prev => prev.map(d => (d.key === key ? { ...d, value } : d)));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const words = bannedWords
        .split(",")
        .map(w => w.trim())
        .filter(Boolean);

      const res = await apiFetch(`/api/brands/${brand.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          voice_dimensions: dimensions,
          voice_notes: notes,
          brand_banned_words: words,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onSave(updated);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!brand) return null;

  return (
    <div className="border-[1.5px] border-ink rounded-[18px] bg-ink text-white overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/15">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.24em] uppercase text-white/60 mb-3">
          <span className="w-2 h-2 rounded-full bg-white" />
          Voice fingerprint
        </div>
        <h2 className="font-display font-[800] text-xl tracking-[-0.02em] m-0">
          {brand.name} <span className="font-display italic font-normal">voice</span>
        </h2>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-6 p-6 max-[820px]:grid-cols-1">
        {/* Left: Dimensions + Notes */}
        <div className="space-y-5">
          {/* Dimension sliders */}
          <div className="space-y-4">
            <div className="text-[10px] tracking-[0.22em] uppercase text-white/60">Tone dimensions</div>
            {dimensions.map(dim => (
              <div key={dim.key} className="grid grid-cols-[120px_1fr_40px] gap-3 items-center">
                <span className="text-[10px] tracking-[0.08em] uppercase text-white/70">
                  {dim.key}
                </span>
                <div className="relative h-6 flex items-center">
                  <div className="absolute inset-x-0 h-[6px] bg-white/12 rounded-full" />
                  <div
                    className="absolute left-0 h-[6px] bg-white rounded-full transition-all duration-100"
                    style={{ width: `${dim.value}%` }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={dim.value}
                    onChange={e => updateDimension(dim.key, Number(e.target.value))}
                    className="absolute inset-x-0 w-full h-6 opacity-0 cursor-pointer"
                  />
                </div>
                <span className="font-display font-[800] text-[13px] text-right tracking-[-0.01em]">
                  {dim.value}
                </span>
              </div>
            ))}
          </div>

          {/* Voice notes */}
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-white/60 mb-2">
              Voice instructions
            </div>
            <textarea
              value={notes}
              onChange={e => { setNotes(e.target.value); setSaved(false); }}
              placeholder="Never use exclamation marks. Keep sentences under 20 words. Sound like a knowledgeable neighbor, not a salesperson."
              rows={5}
              className="w-full bg-white/8 border border-white/15 rounded-[14px] text-white px-4 py-3 font-mono text-[13px] leading-[1.6] outline-none resize-y placeholder:text-white/30 focus:border-white/40"
            />
          </div>
        </div>

        {/* Right: Banned words + Save */}
        <div className="space-y-5">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-white/60 mb-2">
              Banned words (comma-separated)
            </div>
            <textarea
              value={bannedWords}
              onChange={e => { setBannedWords(e.target.value); setSaved(false); }}
              placeholder="leverage, utilize, robust, cutting-edge"
              rows={5}
              className="w-full bg-white/8 border border-white/15 rounded-[14px] text-white px-4 py-3 font-mono text-[13px] leading-[1.6] outline-none resize-y placeholder:text-white/30 focus:border-white/40"
            />
            <div className="text-[10px] text-white/40 mt-1.5">
              These are added to the global banned words list for this brand only.
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <Button
              variant="light"
              size="sm"
              onClick={handleSave}
              disabled={saving || saved}
              className="border-white text-white bg-transparent hover:bg-white hover:text-ink"
            >
              {saving ? "Saving..." : saved ? "Saved" : "Save voice settings"}
            </Button>
            {saved && (
              <span className="text-[11px] text-[#7FE295]">Updated</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
