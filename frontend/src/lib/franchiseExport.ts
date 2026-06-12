/**
 * Franchise export helpers — markdown serializers, CSV builder, and local download.
 * No `any` usage. All exports are named.
 */

import type { FranchiseFactSheet, FranchiseContentPlan, PlanPage } from "./types";

// ---------------------------------------------------------------------------
// Fact Sheet -> Markdown
// ---------------------------------------------------------------------------

export function factSheetToMarkdown(brandName: string, sheet: FranchiseFactSheet): string {
  const lines: string[] = [];

  lines.push(`# ${brandName} - Franchise Fact Sheet`);
  lines.push("");

  // Investment
  const hasInvestment =
    sheet.investment_min != null || sheet.investment_max != null;
  if (hasInvestment) {
    const min =
      sheet.investment_min != null ? `$${sheet.investment_min.toLocaleString()}` : "?";
    const max =
      sheet.investment_max != null ? `$${sheet.investment_max.toLocaleString()}` : "?";
    lines.push(`## Investment Range`);
    lines.push(`${min} - ${max}`);
    lines.push("");
  }

  if (sheet.franchise_fee != null) {
    lines.push(`## Franchise Fee`);
    lines.push(`$${sheet.franchise_fee.toLocaleString()}`);
    lines.push("");
  }

  if (sheet.royalty_pct) {
    lines.push(`## Royalty`);
    lines.push(sheet.royalty_pct);
    lines.push("");
  }

  if (sheet.ad_fund_pct) {
    lines.push(`## Ad Fund`);
    lines.push(sheet.ad_fund_pct);
    lines.push("");
  }

  if (sheet.territory_model) {
    lines.push(`## Territory Model`);
    lines.push(sheet.territory_model);
    lines.push("");
  }

  if (sheet.training_support && sheet.training_support.length > 0) {
    lines.push(`## Training & Support`);
    for (const item of sheet.training_support) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (sheet.process_steps && sheet.process_steps.length > 0) {
    lines.push(`## Process Steps`);
    sheet.process_steps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
    lines.push("");
  }

  if (sheet.differentiators && sheet.differentiators.length > 0) {
    lines.push(`## Differentiators`);
    for (const item of sheet.differentiators) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (sheet.ideal_candidate) {
    lines.push(`## Ideal Candidate`);
    lines.push(sheet.ideal_candidate);
    lines.push("");
  }

  if (sheet.proof_points && sheet.proof_points.length > 0) {
    lines.push(`## Proof Points`);
    for (const item of sheet.proof_points) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  // Sources
  if (sheet.source_urls && sheet.source_urls.length > 0) {
    lines.push(`## Built from`);
    for (const url of sheet.source_urls) {
      lines.push(`- ${url}`);
    }
    if (sheet.scraped_at) {
      lines.push("");
      lines.push(`Scraped: ${sheet.scraped_at}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Content Plan -> Markdown
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<string, string> = { now: "Now", next: "Next", later: "Later" };

export function planToMarkdown(brandName: string, plan: FranchiseContentPlan): string {
  const lines: string[] = [];

  lines.push(`# ${brandName} - Franchise Content Roadmap`);
  lines.push("");
  lines.push(`Generated: ${new Date(plan.generated_at).toLocaleDateString()}`);
  lines.push("");

  if (plan.site_urls && plan.site_urls.length > 0) {
    lines.push(`## Researched From`);
    for (const url of plan.site_urls) {
      lines.push(`- ${url}`);
    }
    lines.push("");
  }

  // Build page index for pillar lookups
  const pageIndex = new Map<string, PlanPage>(plan.pages.map((p) => [p.id, p]));

  const tierOrder = ["now", "next", "later"] as const;
  for (const tier of tierOrder) {
    const pages = plan.pages.filter((p) => p.tier === tier);
    if (pages.length === 0) continue;

    lines.push(`## ${TIER_LABELS[tier]} (${pages.length} pages)`);
    lines.push("");

    for (const page of pages) {
      lines.push(`### ${page.title}`);
      lines.push("");

      lines.push(`**Format:** ${page.format}`);

      if (page.target_keywords && page.target_keywords.length > 0) {
        const kwStr = page.target_keywords
          .map((kw) => `${kw.kw} (${kw.volume.toLocaleString()}/mo)`)
          .join(", ");
        lines.push(`**Target keywords:** ${kwStr}`);
      }

      if (page.intent) {
        lines.push(`**Intent:** ${page.intent}`);
      }

      if (page.rationale) {
        lines.push(`**Rationale:** ${page.rationale}`);
      }

      if (page.serp_notes) {
        lines.push(`**SERP notes:** ${page.serp_notes}`);
      }

      if (page.pillar_id) {
        const pillarPage = pageIndex.get(page.pillar_id);
        if (pillarPage) {
          lines.push(`**Pillar:** ${pillarPage.title}`);
        }
      }

      lines.push(`**Status:** ${page.status}`);

      if (page.outline && page.outline.length > 0) {
        lines.push("");
        lines.push("**Outline:**");
        for (const item of page.outline) {
          lines.push(`- ${item.h2}${item.note ? `: ${item.note}` : ""}`);
        }
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Content Plan -> CSV
// ---------------------------------------------------------------------------

/** Escape a single value for CSV: wrap in quotes, double inner quotes. */
function csvEscape(val: string): string {
  const escaped = val.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function planToCsv(plan: FranchiseContentPlan): string {
  const pageIndex = new Map<string, PlanPage>(plan.pages.map((p) => [p.id, p]));

  const header = [
    "tier",
    "title",
    "format",
    "target_keywords",
    "top_volume",
    "intent",
    "rationale",
    "serp_notes",
    "pillar",
    "status",
  ].join(",");

  const tierOrder = ["now", "next", "later"] as const;
  const rows: string[] = [header];

  for (const tier of tierOrder) {
    const pages = plan.pages.filter((p) => p.tier === tier);
    for (const page of pages) {
      const kwStr = (page.target_keywords ?? [])
        .map((kw) => `${kw.kw} (${kw.volume.toLocaleString()}/mo)`)
        .join("; ");

      const topVolume = page.target_keywords?.[0]?.volume ?? 0;

      const pillarTitle = page.pillar_id
        ? (pageIndex.get(page.pillar_id)?.title ?? "")
        : "";

      const row = [
        csvEscape(tier),
        csvEscape(page.title),
        csvEscape(page.format),
        csvEscape(kwStr),
        csvEscape(String(topVolume)),
        csvEscape(page.intent ?? ""),
        csvEscape(page.rationale ?? ""),
        csvEscape(page.serp_notes ?? ""),
        csvEscape(pillarTitle),
        csvEscape(page.status),
      ].join(",");

      rows.push(row);
    }
  }

  return rows.join("\n");
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Slug helper (for filenames)
// ---------------------------------------------------------------------------

/** Convert a brand name to a safe filename slug, e.g. "My Brand, Inc." -> "my-brand-inc" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
