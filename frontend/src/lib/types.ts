// Shared API response types used across pages and hooks.

export type PipelinePhase =
  | "pending"
  | "brief"
  | "research"
  | "outline"
  | "outline_review"
  | "generating"
  | "scoring"
  | "revising"
  | "done"
  | "error";

/** Phases where a pipeline job is still running and the UI should poll. */
export const ACTIVE_PIPELINE_PHASES: ReadonlySet<string> = new Set<PipelinePhase>([
  "pending",
  "brief",
  "research",
  "outline",
  "generating",
  "scoring",
  "revising",
]);

export interface Brand {
  id: string;
  name: string;
  short_name?: string | null;
  primary_keyword?: string | null;
}

export interface Location {
  id: string;
  brand_id?: string;
  name?: string | null;
  city: string;
  state: string;
  slug?: string | null;
  status?: string | null;
  last_refresh_at?: string | null;
  local_context?: Record<string, unknown> | null;
}

export interface TermTarget {
  phrase: string;
  target: number;
  weight?: number;
}

export interface PopBrief {
  term_targets?: TermTarget[];
  word_count_target?: number;
  [key: string]: unknown;
}

export interface PopTermStat {
  phrase: string;
  current: number;
  target: number;
}

export interface PopScore {
  overall_score: number;
  term_score: number;
  word_count_score: number;
  recommendations: string[];
  well_optimized: PopTermStat[];
  missing: PopTermStat[];
}

export interface OutlineSection {
  h2: string;
  key_points?: string[];
}

export interface OutlineData {
  h1?: string;
  sections?: OutlineSection[];
  estimated_word_count?: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface PipelineJob {
  id: string;
  brand_id: string;
  location_id: string | null;
  keyword: string;
  city: string;
  state: string;
  content_type: string;
  template_id: string | null;
  phase: PipelinePhase;
  brief: PopBrief | null;
  outline: OutlineData | null;
  content: string | null;
  score: PopScore | number | null;
  error: string | null;
  revision_count: number;
  word_count: number;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface Generation {
  id: string;
  brand_id?: string;
  location_id?: string | null;
  keyword: string;
  city: string;
  content?: string;
  outline?: string | null;
  content_type?: string;
  template_name?: string | null;
  model?: string;
  word_count: number;
  input_tokens?: number;
  output_tokens?: number;
  pop_brief?: PopBrief | null;
  pop_score?: PopScore | null;
  revision_count?: number;
  created_at: string;
}

/** Request body for streaming generation endpoints (see useGeneration). */
export type GenerationPayload = Record<string, unknown>;

export interface FranchiseGeneratePayload {
  brand_id: string;
  page_type?: string;
  plan_page_id?: string;
}

export interface PlanKeyword { kw: string; volume: number; }
export interface PlanOutlineItem { h2: string; note: string; }
export interface PlanPage {
  id: string;
  tier: "now" | "next" | "later";
  title: string;
  format: string;
  target_keywords: PlanKeyword[];
  intent: string;
  rationale: string;
  serp_notes: string;
  outline: PlanOutlineItem[];
  pillar_id: string | null;
  status: "planned" | "generated";
  generation_id: string | null;
}
export interface PlanCluster {
  name: string;
  keywords: PlanKeyword[];
  intent: string;
  serp_top?: { domain: string; title: string }[];
}
export interface FranchiseContentPlan {
  generated_at: string;
  site_urls: string[];
  seed_keywords_used: string[];
  brand_profile: string;
  clusters: PlanCluster[];
  pages: PlanPage[];
}

export interface FranchiseFactSheet {
  investment_min?: number | null;
  investment_max?: number | null;
  franchise_fee?: number | null;
  royalty_pct?: string | null;
  ad_fund_pct?: string | null;
  territory_model?: string | null;
  training_support?: string[];
  process_steps?: string[];
  differentiators?: string[];
  ideal_candidate?: string | null;
  proof_points?: string[];
  source_urls?: string[];
  scraped_at?: string;
}

export const FRANCHISE_PAGE_TYPES = [
  { key: "franchise_why", label: "Why Franchise With Us" },
  { key: "franchise_investment", label: "Investment & Fees" },
] as const;
