"use client";

import { Pill } from "@/components/shared/Pill";

interface Location {
  id: string;
  name: string;
  city: string;
  state: string;
  slug: string;
  status: string;
  local_context: any;
  created_at: string;
}

interface LocationsListProps {
  locations: Location[];
  onSelect: (loc: Location) => void;
  onDelete: (id: string) => void;
  selectedId: string | null;
}

const LOCAL_CONTEXT_FIELDS = [
  "team_lead",
  "neighborhoods",
  "common_job",
  "local_challenge",
  "fun_fact",
  "competitors_to_avoid",
  "certifications",
  "climate_notes",
  "housing_notes",
  "reviews",
];

function countFilledFields(ctx: any): string {
  if (!ctx || typeof ctx !== "object") return "0/10 fields";
  let filled = 0;
  for (const key of LOCAL_CONTEXT_FIELDS) {
    const val = ctx[key];
    if (val === undefined || val === null || val === "") continue;
    if (Array.isArray(val) && val.length === 0) continue;
    filled++;
  }
  return `${filled}/${LOCAL_CONTEXT_FIELDS.length} fields`;
}

export function LocationsList({ locations, onSelect, onDelete, selectedId }: LocationsListProps) {
  if (locations.length === 0) {
    return (
      <div className="text-[13px] text-ink-40 text-center py-12">
        No locations yet. Add one to get started.
      </div>
    );
  }

  return (
    <div className="border-[1.5px] border-ink rounded-[18px] overflow-hidden">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b-[1.5px] border-ink">
              Name
            </th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b-[1.5px] border-ink">
              Slug
            </th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b-[1.5px] border-ink">
              Status
            </th>
            <th className="text-left px-5 py-2.5 bg-line-soft text-[10px] tracking-[0.22em] uppercase text-ink-70 font-medium border-b-[1.5px] border-ink">
              Local context
            </th>
            <th className="px-5 py-2.5 bg-line-soft border-b-[1.5px] border-ink" />
          </tr>
        </thead>
        <tbody>
          {locations.map((loc) => (
            <tr
              key={loc.id}
              onClick={() => onSelect(loc)}
              className={`cursor-pointer transition-colors ${
                selectedId === loc.id ? "bg-line-soft" : "hover:bg-line-soft"
              }`}
            >
              <td className="px-5 py-3 border-b border-line">
                <div className="font-display font-[800] text-[13px]">{loc.name}</div>
                <div className="font-display italic text-ink-40 text-[11px]">
                  {loc.city}, {loc.state}
                </div>
              </td>
              <td className="px-5 py-3 border-b border-line text-ink-40 font-mono text-[11px]">
                {loc.slug}
              </td>
              <td className="px-5 py-3 border-b border-line">
                <Pill variant={loc.status === "live" ? "live" : loc.status === "stale" ? "stale" : "draft"}>
                  {loc.status}
                </Pill>
              </td>
              <td className="px-5 py-3 border-b border-line text-ink-40 text-[11px]">
                {countFilledFields(loc.local_context)}
              </td>
              <td className="px-5 py-3 border-b border-line text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(loc.id);
                  }}
                  className="text-[11px] text-ink-40 hover:text-[#b91c1c] transition-colors"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
