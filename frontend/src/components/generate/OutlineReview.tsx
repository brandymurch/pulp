"use client";
import { useState } from "react";
import { Button } from "@/components/shared/Button";

interface OutlineSection {
  h2: string;
  key_points: string[];
  suggested_terms?: string[];
}

interface Outline {
  h1: string;
  sections: OutlineSection[];
  internal_links?: { text: string; href: string }[];
  estimated_word_count?: number;
}

interface OutlineReviewProps {
  outline: Outline;
  onApprove: (outline: Outline) => void;
  onEdit?: (outline: Outline) => void;
}

export function OutlineReview({ outline, onApprove }: OutlineReviewProps) {
  const [editing, setEditing] = useState(false);
  const [editedOutline, setEditedOutline] = useState<Outline>(outline);

  function updateH2(idx: number, value: string) {
    const sections = [...editedOutline.sections];
    sections[idx] = { ...sections[idx], h2: value };
    setEditedOutline({ ...editedOutline, sections });
  }

  function updateKeyPoint(sIdx: number, kIdx: number, value: string) {
    const sections = [...editedOutline.sections];
    const points = [...sections[sIdx].key_points];
    points[kIdx] = value;
    sections[sIdx] = { ...sections[sIdx], key_points: points };
    setEditedOutline({ ...editedOutline, sections });
  }

  const current = editing ? editedOutline : outline;

  return (
    <div className="border-[1.5px] border-ink rounded-[18px] bg-white overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b-[1.5px] border-ink">
        <h3 className="font-display font-[800] text-lg tracking-[-0.02em] m-0">
          Outline <span className="font-display italic font-normal">review</span>
        </h3>
        {current.estimated_word_count && (
          <span className="text-[10px] tracking-[0.22em] uppercase text-ink-70">
            ~{current.estimated_word_count} words
          </span>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* H1 */}
        <div className="font-display font-[800] text-2xl tracking-[-0.02em]">
          {editing ? (
            <input
              value={editedOutline.h1}
              onChange={e => setEditedOutline({ ...editedOutline, h1: e.target.value })}
              className="w-full border-b-[1.5px] border-ink bg-transparent outline-none font-display font-[800] text-2xl tracking-[-0.02em]"
            />
          ) : (
            current.h1
          )}
        </div>

        {/* Sections */}
        {current.sections.map((section, sIdx) => (
          <div key={sIdx} className="border-[1.5px] border-line rounded-[14px] p-4">
            <div className="font-display font-[800] text-base tracking-[-0.01em] mb-2">
              {editing ? (
                <input
                  value={section.h2}
                  onChange={e => updateH2(sIdx, e.target.value)}
                  className="w-full border-b border-line bg-transparent outline-none font-display font-[800]"
                />
              ) : (
                section.h2
              )}
            </div>
            <ul className="space-y-1">
              {section.key_points.map((point, kIdx) => (
                <li key={kIdx} className="flex gap-2 text-[13px] text-ink-70">
                  <span className="text-ink-40 mt-0.5">-</span>
                  {editing ? (
                    <input
                      value={point}
                      onChange={e => updateKeyPoint(sIdx, kIdx, e.target.value)}
                      className="flex-1 bg-transparent border-b border-line outline-none text-[13px]"
                    />
                  ) : (
                    point
                  )}
                </li>
              ))}
            </ul>
            {section.suggested_terms && section.suggested_terms.length > 0 && (
              <div className="mt-2 flex gap-1.5 flex-wrap">
                {section.suggested_terms.map((term, i) => (
                  <span key={i} className="text-[9px] tracking-[0.1em] uppercase bg-line-soft text-ink-70 px-2 py-0.5 rounded-full">
                    {term}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Internal links */}
        {current.internal_links && current.internal_links.length > 0 && (
          <div className="text-[11px] text-ink-70">
            <span className="text-[10px] tracking-[0.22em] uppercase text-ink-40">Internal links: </span>
            {current.internal_links.map((link, i) => (
              <span key={i}>
                {i > 0 && ", "}
                <span className="text-ink">{link.text}</span>
                <span className="text-ink-40"> ({link.href})</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-6 py-4 border-t border-line">
        <Button variant="ink" size="sm" onClick={() => onApprove(editing ? editedOutline : outline)}>
          Approve outline
        </Button>
        <Button variant="light" size="sm" onClick={() => setEditing(!editing)}>
          {editing ? "Done editing" : "Edit"}
        </Button>
      </div>
    </div>
  );
}
