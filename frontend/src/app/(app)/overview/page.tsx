"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  total_locations: number;
  total_generations: number;
  avg_score: number;
  content_freshness: { fresh: number; aging: number; stale: number };
  recent_generations: {
    keyword: string;
    city: string;
    word_count: number;
    score: number | null;
    created_at: string;
  }[];
  top_scores: {
    keyword: string;
    city: string;
    score: number;
    created_at: string;
  }[];
  needs_refresh: {
    city: string;
    state: string;
    last_generated: string | null;
    days_ago: number | null;
  }[];
}

interface Brand {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function scoreColor(score: number): string {
  if (score >= 80) return "text-green";
  if (score >= 60) return "text-amber";
  return "text-[#b91c1c]";
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components (named exports)                                    */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="border-[1.5px] border-ink rounded-pop-lg p-5 bg-white">
      <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-3">
        {label}
      </div>
      <div
        className={`font-display font-[800] text-[clamp(32px,4vw,48px)] leading-none tracking-[-0.03em] ${accent || "text-ink"}`}
      >
        {value}
      </div>
    </div>
  );
}

function FreshnessRow({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-[13px] text-ink">{label}</span>
      </div>
      <span className="font-display font-[800] text-[15px] text-ink">
        {count}
      </span>
    </div>
  );
}

function NeedsRefreshRow({
  city,
  state,
  daysAgo,
}: {
  city: string;
  state: string;
  daysAgo: number | null;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-line last:border-0">
      <div>
        <span className="text-[13px] text-ink">
          {city}, {state}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-ink-40">
          {daysAgo === null ? "No content" : `${daysAgo} days ago`}
        </span>
        <Link
          href={`/generate`}
          className="text-[11px] font-medium text-ink-70 hover:text-ink transition-colors underline"
        >
          Generate
        </Link>
      </div>
    </div>
  );
}

function RecentRow({
  keyword,
  city,
  score,
  createdAt,
}: {
  keyword: string;
  city: string;
  score: number | null;
  createdAt: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-line last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink truncate">{keyword}</div>
        <div className="text-[11px] text-ink-40">{city}</div>
      </div>
      <div className="flex items-center gap-4 flex-none">
        {score !== null && (
          <span
            className={`text-[12px] font-display font-[800] ${scoreColor(score)}`}
          >
            {score}
          </span>
        )}
        <span className="text-[11px] text-ink-40 w-[72px] text-right">
          {relativeDate(createdAt)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function OverviewPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load brands on mount
  useEffect(() => {
    async function loadBrands() {
      try {
        const res = await apiFetch("/api/brands");
        if (!res.ok) return;
        const data: Brand[] = await res.json();
        setBrands(data);
        // Default to all brands
        setBrandId("");
      } catch {
        setError("Failed to load brands");
        setLoading(false);
      }
    }
    loadBrands();
  }, []);

  // Load dashboard stats when brand changes
  const loadStats = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = id ? `/api/dashboard/stats?brand_id=${id}` : `/api/dashboard/stats`;
      const res = await apiFetch(url);
      if (!res.ok) {
        setError("Failed to load dashboard stats");
        return;
      }
      const data: DashboardStats = await res.json();
      setStats(data);
    } catch {
      setError("Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats(brandId);
  }, [brandId, loadStats]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h1 className="font-display font-[800] text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.035em] m-0">
          Overview
        </h1>

        {brands.length > 0 && (
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="h-[38px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[14px] text-[12px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] appearance-none cursor-pointer"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="border-[1.5px] border-[#b91c1c] rounded-pop px-5 py-3 text-[13px] text-[#b91c1c] bg-[rgba(185,28,28,0.05)]">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-[13px] text-ink-40 animate-pulse">
          Loading dashboard...
        </div>
      )}

      {/* Dashboard content */}
      {!loading && stats && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 max-[820px]:grid-cols-1">
            <StatCard label="Locations" value={stats.total_locations} />
            <StatCard
              label="Pages generated"
              value={stats.total_generations}
            />
            <StatCard
              label="Avg SEO score"
              value={stats.avg_score || "\u2014"}
              accent={
                stats.avg_score ? scoreColor(stats.avg_score) : undefined
              }
            />
          </div>

          {/* Content freshness + Needs refresh side-by-side */}
          <div className="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">
            {/* Content freshness */}
            <div className="border-[1.5px] border-ink rounded-pop-lg p-5 bg-white">
              <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-3">
                Content freshness
              </div>
              <FreshnessRow
                label="Fresh (under 30 days)"
                count={stats.content_freshness.fresh}
                color="bg-green"
              />
              <FreshnessRow
                label="Aging (30 to 60 days)"
                count={stats.content_freshness.aging}
                color="bg-amber"
              />
              <FreshnessRow
                label="Stale (60+ days)"
                count={stats.content_freshness.stale}
                color="bg-[#b91c1c]"
              />
            </div>

            {/* Needs refresh */}
            <div className="border-[1.5px] border-ink rounded-pop-lg p-5 bg-white">
              <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-3">
                Needs refresh
              </div>
              {stats.needs_refresh.length === 0 ? (
                <div className="text-[13px] text-ink-40 py-2">
                  All locations are up to date.
                </div>
              ) : (
                <div>
                  {stats.needs_refresh.map((loc, i) => (
                    <NeedsRefreshRow
                      key={`${loc.city}-${loc.state}-${i}`}
                      city={loc.city}
                      state={loc.state}
                      daysAgo={loc.days_ago}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent generations + Top scores side-by-side */}
          <div className="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">
            {/* Recent generations */}
            <div className="border-[1.5px] border-ink rounded-pop-lg p-5 bg-white">
              <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-3">
                Recent generations
              </div>
              {stats.recent_generations.length === 0 ? (
                <div className="text-[13px] text-ink-40 py-2">
                  No content generated yet.
                </div>
              ) : (
                <div>
                  {stats.recent_generations.map((gen, i) => (
                    <RecentRow
                      key={`recent-${i}`}
                      keyword={gen.keyword}
                      city={gen.city}
                      score={gen.score}
                      createdAt={gen.created_at}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Top scores */}
            <div className="border-[1.5px] border-ink rounded-pop-lg p-5 bg-white">
              <div className="text-[10px] tracking-[0.22em] uppercase text-ink-40 mb-3">
                Top scores
              </div>
              {stats.top_scores.length === 0 ? (
                <div className="text-[13px] text-ink-40 py-2">
                  No scored content yet.
                </div>
              ) : (
                <div>
                  {stats.top_scores.map((gen, i) => (
                    <RecentRow
                      key={`top-${i}`}
                      keyword={gen.keyword}
                      city={gen.city}
                      score={gen.score}
                      createdAt={gen.created_at}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
