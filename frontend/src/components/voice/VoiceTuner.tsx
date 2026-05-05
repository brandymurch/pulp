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

const labelClass = "block text-[12px] tracking-[0.14em] uppercase text-ink font-semibold mb-1.5";
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
  const [competitors, setCompetitors] = useState("");
  const [landingPageTemplate, setLandingPageTemplate] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);

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
    setCompetitors((brand.competitors || []).join(", "));
    setLandingPageTemplate((brand.content_templates || {}).landing_page || "");
    setEditingSection(null);
  }, [brand]);

  async function saveSection() {
    setSaving(true);
    try {
      const words = bannedWords.split(",").map(w => w.trim()).filter(Boolean);
      const svcList = services.split("\n").map(s => s.trim()).filter(Boolean);
      const compList = competitors.split(",").map(c => c.trim()).filter(Boolean);
      const res = await apiFetch(`/api/brands/${brand.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          voice_dimensions: dimensions,
          voice_notes: notes,
          brand_banned_words: words,
          services: svcList,
          brand_guidelines: guidelines,
          competitors: compList,
          content_templates: {
            ...(brand.content_templates || {}),
            landing_page: landingPageTemplate,
          },
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
    setCompetitors((brand.competitors || []).join(", "));
    setLandingPageTemplate((brand.content_templates || {}).landing_page || "");
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
            : <div className="text-[13px] text-ink-70">No voice instructions set.</div>
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
            : <div className="text-[13px] text-ink-70">No brand guidelines set.</div>
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
          ) : <div className="text-[13px] text-ink-70">No services set.</div>
        }
      >
        <textarea className={textareaClass} value={services} onChange={e => setServices(e.target.value)} placeholder={"Injection Foam Insulation\nSpray Foam Insulation"} rows={4} />
        <div className="text-[10px] text-ink-40 mt-1">Content will only reference these services.</div>
      </EditableSection>

      {/* Competitors (brand level, applied to all locations) */}
      <EditableSection
        title="Competitors (do not mention)"
        editing={editingSection === "competitors"}
        onEdit={() => setEditingSection("competitors")}
        onSave={saveSection}
        onCancel={cancelEdit}
        saving={saving}
        display={
          competitors.trim() ? (
            <div className="flex flex-wrap gap-1.5">
              {competitors.split(",").filter(Boolean).map((c, i) => (
                <span key={i} className="text-[11px] bg-[rgba(185,28,28,0.06)] text-[#b91c1c]/70 px-2 py-1 rounded-lg">{c.trim()}</span>
              ))}
            </div>
          ) : <div className="text-[13px] text-ink-70">No brand-level competitors set.</div>
        }
      >
        <input className={inputClass} value={competitors} onChange={e => setCompetitors(e.target.value)} placeholder="RetroFoam, ABC Insulation, CompetitorX" />
        <div className="text-[10px] text-ink-40 mt-1">Applied to all locations. Location-level competitors are added on top.</div>
      </EditableSection>

      {/* Landing page template */}
      <EditableSection
        title="Landing page template"
        editing={editingSection === "template"}
        onEdit={() => setEditingSection("template")}
        onSave={saveSection}
        onCancel={cancelEdit}
        saving={saving}
        display={
          landingPageTemplate.trim() ? (
            <pre className="text-[11px] text-ink-70 leading-[1.6] whitespace-pre-wrap max-h-[300px] overflow-y-auto font-mono">{landingPageTemplate.slice(0, 500)}{landingPageTemplate.length > 500 ? "..." : ""}</pre>
          ) : <div className="text-[13px] text-ink-70">No landing page template set. Content will follow the outline only.</div>
        }
      >
        <textarea className={textareaClass} value={landingPageTemplate} onChange={e => setLandingPageTemplate(e.target.value)} placeholder={"# [Service] in [location]\n\n## Section heading\n\nParagraph content...\n\n## Another section\n\n..."} rows={16} />
        <div className="flex items-center gap-3 mt-2">
          <div className="text-[10px] text-ink-40 flex-1">Use [location], [city], [state] as placeholders. This structure guides every landing page generated for this brand.</div>
          <button
            onClick={async () => {
              setGeneratingTemplate(true);
              try {
                const startRes = await apiFetch(`/api/brands/${brand.id}/generate-template`, { method: "POST" });
                if (!startRes.ok) return;
                const { job_id } = await startRes.json();
                // Poll for result
                for (let i = 0; i < 120; i++) {
                  await new Promise(r => setTimeout(r, 3000));
                  const pollRes = await apiFetch(`/api/brands/generate-template/status/${job_id}`);
                  if (!pollRes.ok) continue;
                  const data = await pollRes.json();
                  if (data.status === "done") {
                    setLandingPageTemplate(data.template);
                    break;
                  }
                }
              } catch {} finally {
                setGeneratingTemplate(false);
              }
            }}
            disabled={generatingTemplate}
            className="text-[11px] text-pulp-deep hover:text-ink transition-colors cursor-pointer bg-transparent border-0 p-0 font-medium whitespace-nowrap disabled:opacity-50"
          >
            {generatingTemplate ? "Analyzing SEO data..." : "Generate from POP"}
          </button>
        </div>
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
          ) : <div className="text-[13px] text-ink-70">No brand-specific banned words. Global list still applies.</div>
        }
      >
        <textarea className={textareaClass} value={bannedWords} onChange={e => setBannedWords(e.target.value)} placeholder="leverage, utilize, robust" rows={2} />
        <div className="text-[10px] text-ink-40 mt-1">Added to the global banned words list for this brand.</div>
      </EditableSection>

      {/* Learned patterns (read-only, from past generations) */}
      {brand?.prompt_learnings?.length > 0 && (
        <div className="border-[1.5px] border-line rounded-[14px] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] tracking-[0.14em] uppercase text-ink font-semibold">
              Learned patterns
            </h3>
            <span className="text-[10px] text-ink-40">{brand.prompt_learnings.length} insights</span>
          </div>
          <div className="space-y-1.5">
            {brand.prompt_learnings.map((learning: string, i: number) => (
              <div key={i} className="flex items-start gap-2 group">
                <span className="text-[12px] text-ink-70 flex-1 leading-[1.5]">{learning}</span>
                <button
                  onClick={async () => {
                    const updated = brand.prompt_learnings.filter((_: string, idx: number) => idx !== i);
                    try {
                      await apiFetch(`/api/brands/${brand.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ prompt_learnings: updated }),
                      });
                      onSave(brand);
                    } catch {}
                  }}
                  className="opacity-0 group-hover:opacity-100 text-[10px] text-[#b91c1c]/50 hover:text-[#b91c1c] transition-opacity shrink-0 mt-0.5"
                >
                  remove
                </button>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-ink-40 mt-3">Auto-generated from past content runs. These guide future generations for this brand.</div>
        </div>
      )}
    </div>
  );
}
