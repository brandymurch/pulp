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
const inputClass = "w-full h-10 border-[1.5px] border-line rounded-lg bg-white text-ink px-3 text-[13px] outline-none focus:border-ink transition-colors";
const textareaClass = "w-full border-[1.5px] border-line rounded-lg bg-white text-ink px-3 py-2.5 text-[13px] leading-[1.6] outline-none focus:border-ink transition-colors resize-y";

function EditableSection({ title, editing, onEdit, onSave, onCancel, saving, children, display }: {
  title: string;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  children: React.ReactNode;
  display: React.ReactNode;
}) {
  return (
    <div className="border-b border-line pb-5">
      <div className="flex items-center justify-between mb-3">
        <label className={labelClass + " mb-0"}>{title}</label>
        {!editing ? (
          <button onClick={onEdit} className="text-[11px] text-pulp-deep hover:text-ink transition-colors cursor-pointer bg-transparent border-0 p-0 font-medium">
            Edit
          </button>
        ) : (
          <div className="flex gap-2 items-center">
            <button onClick={onSave} disabled={saving} className="text-[11px] text-[#1F7A3A] hover:text-[#165c2b] font-medium cursor-pointer bg-transparent border-0 p-0">
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={onCancel} className="text-[11px] text-ink-40 hover:text-ink cursor-pointer bg-transparent border-0 p-0">
              Cancel
            </button>
          </div>
        )}
      </div>
      {editing ? children : display}
    </div>
  );
}

export function VoiceTuner({ brand, onSave }: VoiceTunerProps) {
  const [dimensions, setDimensions] = useState<VoiceDimension[]>([]);
  const [notes, setNotes] = useState("");
  const [bannedWords, setBannedWords] = useState("");
  const [services, setServices] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    setEditingSection(null);
  }, [brand]);

  async function saveSection() {
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
        setEditingSection(null);
      }
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    // Reset to brand values
    const dims = brand.voice_dimensions;
    setDimensions(Array.isArray(dims) && dims.length > 0 ? dims : [
      { key: "Warmth", value: 50 }, { key: "Wit", value: 50 },
      { key: "Formality", value: 50 }, { key: "Local color", value: 50 },
      { key: "Sales-y", value: 50 },
    ]);
    setNotes(brand.voice_notes || "");
    setBannedWords((brand.brand_banned_words || []).join(", "));
    setServices((brand.services || []).join("\n"));
    setGuidelines(brand.brand_guidelines || "");
    setEditingSection(null);
  }

  if (!brand) return null;

  return (
    <div className="space-y-5">
      {/* Tone dimensions */}
      <EditableSection
        title="Tone dimensions"
        editing={editingSection === "tone"}
        onEdit={() => setEditingSection("tone")}
        onSave={saveSection}
        onCancel={cancelEdit}
        saving={saving}
        display={
          <div className="space-y-2">
            {dimensions.map(dim => (
              <div key={dim.key} className="flex items-center gap-3">
                <span className="text-[11px] text-ink-70 w-[100px] shrink-0">{dim.key}</span>
                <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
                  <div className="h-full bg-ink rounded-full" style={{ width: `${dim.value}%` }} />
                </div>
                <span className="text-[12px] text-ink-40 w-8 text-right">{dim.value}</span>
              </div>
            ))}
          </div>
        }
      >
        <div className="space-y-3">
          {dimensions.map(dim => (
            <div key={dim.key} className="flex items-center gap-3">
              <span className="text-[11px] text-ink-70 w-[100px] shrink-0">{dim.key}</span>
              <input type="range" min={0} max={100} value={dim.value}
                onChange={e => setDimensions(prev => prev.map(d => d.key === dim.key ? { ...d, value: Number(e.target.value) } : d))}
                className="flex-1 h-1.5 appearance-none bg-line rounded-full accent-ink cursor-pointer" />
              <span className="text-[12px] text-ink-40 w-8 text-right">{dim.value}</span>
            </div>
          ))}
        </div>
      </EditableSection>

      {/* Voice instructions */}
      <EditableSection
        title="Voice instructions"
        editing={editingSection === "notes"}
        onEdit={() => setEditingSection("notes")}
        onSave={saveSection}
        onCancel={cancelEdit}
        saving={saving}
        display={
          notes ? <div className="text-[13px] text-ink-70 whitespace-pre-wrap">{notes}</div>
            : <div className="text-[12px] text-ink-40">No voice instructions set.</div>
        }
      >
        <textarea className={textareaClass} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Never use exclamation marks. Keep sentences under 20 words." rows={3} />
      </EditableSection>

      {/* Brand guidelines */}
      <EditableSection
        title="Brand guidelines"
        editing={editingSection === "guidelines"}
        onEdit={() => setEditingSection("guidelines")}
        onSave={saveSection}
        onCancel={cancelEdit}
        saving={saving}
        display={
          guidelines ? <div className="text-[13px] text-ink-70 whitespace-pre-wrap">{guidelines}</div>
            : <div className="text-[12px] text-ink-40">No brand guidelines set.</div>
        }
      >
        <textarea className={textareaClass} value={guidelines} onChange={e => setGuidelines(e.target.value)} placeholder={"Target audience: homeowners 30-65\nDo not mention competitors by name"} rows={4} />
        <div className="text-[10px] text-ink-40 mt-1">Rules, positioning, audience, things to avoid.</div>
      </EditableSection>

      {/* Services */}
      <EditableSection
        title="Services"
        editing={editingSection === "services"}
        onEdit={() => setEditingSection("services")}
        onSave={saveSection}
        onCancel={cancelEdit}
        saving={saving}
        display={
          services.trim() ? (
            <div className="flex flex-wrap gap-1.5">
              {services.split("\n").filter(Boolean).map((s, i) => (
                <span key={i} className="text-[11px] bg-[#F3F1ED] text-ink-70 px-2 py-1 rounded-lg">{s.trim()}</span>
              ))}
            </div>
          ) : <div className="text-[12px] text-ink-40">No services set.</div>
        }
      >
        <textarea className={textareaClass} value={services} onChange={e => setServices(e.target.value)} placeholder={"Injection Foam Insulation\nSpray Foam Insulation"} rows={4} />
        <div className="text-[10px] text-ink-40 mt-1">Content will only reference these services.</div>
      </EditableSection>

      {/* Banned words */}
      <EditableSection
        title="Banned words"
        editing={editingSection === "banned"}
        onEdit={() => setEditingSection("banned")}
        onSave={saveSection}
        onCancel={cancelEdit}
        saving={saving}
        display={
          bannedWords.trim() ? (
            <div className="flex flex-wrap gap-1.5">
              {bannedWords.split(",").filter(Boolean).map((w, i) => (
                <span key={i} className="text-[11px] bg-[rgba(185,28,28,0.06)] text-[#b91c1c]/70 px-2 py-1 rounded-lg">{w.trim()}</span>
              ))}
            </div>
          ) : <div className="text-[12px] text-ink-40">No brand-specific banned words. Global list still applies.</div>
        }
      >
        <textarea className={textareaClass} value={bannedWords} onChange={e => setBannedWords(e.target.value)} placeholder="leverage, utilize, robust" rows={2} />
        <div className="text-[10px] text-ink-40 mt-1">Added to the global banned words list for this brand.</div>
      </EditableSection>
    </div>
  );
}
