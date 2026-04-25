"use client";

import { useState } from "react";
import { SliceMark, ArrowIcon } from "@/components/shared/Icons";

/* ------------------------------------------------------------------ */
/*  Squiggle underline SVG                                             */
/* ------------------------------------------------------------------ */

function Squiggle() {
  return (
    <svg
      viewBox="0 0 200 10"
      preserveAspectRatio="none"
      className="absolute left-[-2%] right-[-2%] bottom-[-0.28em] w-[104%] h-[0.32em]"
      style={{ color: "var(--pulp)" }}
      aria-hidden="true"
    >
      <path
        d="M0 5 Q 25 0, 50 5 T 100 5 T 150 5 T 200 5"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Demo data — Brightline HVAC across 7 cities                        */
/* ------------------------------------------------------------------ */

interface DemoEntry {
  loc: string;
  locEm: string;
  path: string;
  h: string;
  p1: string;
  p2: string;
  age: string;
}

const demos: DemoEntry[] = [
  {
    loc: "Brightline HVAC",
    locEm: "Mesa",
    path: "/az-mesa",
    h: "Mesa summers hit 118\u00b0. Your AC shouldn\u2019t be the reason you move.",
    p1: "Desert heat punishes tired condensers. Our Mesa team stocks R-410A and R-454B, same-day installs on two- to five-ton splits, and we pull Maricopa permits in-house so you aren\u2019t waiting on a clipboard. Mini-splits for the Arizona Room are a house specialty.",
    p2: "Service calls answered 6am\u2013midnight, seven days. Red Tag tune-ups start at $89 before the monsoons flip the switch.",
    age: "2 days ago",
  },
  {
    loc: "Brightline HVAC",
    locEm: "Portland",
    path: "/or-portland",
    h: "Heat pumps for a town that finally needs cooling too.",
    p1: "Portland\u2019s 2021 dome changed the conversation. We size dual-fuel heat pumps for 1920s Craftsmans, retrofit ductless into bungalows with no attic, and know which PGE rebates actually clear. Our techs keep sizing charts for the east-side vs. west-side microclimates taped to the van.",
    p2: "Energy Trust of Oregon paperwork filed same day. Weekend calls answered before Monday.",
    age: "4 days ago",
  },
  {
    loc: "Brightline HVAC",
    locEm: "Denver",
    path: "/co-denver",
    h: "Altitude fools undersized systems. Ours aren\u2019t.",
    p1: "At 5,280 feet, refrigerant charges and combustion air both behave differently. Our Denver crews derate systems to the Front Range, handle Xcel rebate paperwork, and stock parts for the 80% furnaces still heating half the bungalows in Park Hill.",
    p2: "Spring tune-ups booked now. Hailstorm coil-fin combs kept in every truck May through September.",
    age: "Today",
  },
  {
    loc: "Brightline HVAC",
    locEm: "Chicago NW",
    path: "/il-chi-nw",
    h: "Lake-effect winters. Two-stage furnaces. No drafts.",
    p1: "Logan Square two-flats and Jefferson Park bungalows don\u2019t want the same system. We spec two-stage and modulating furnaces for real Chicago winters, handle ComEd and Nicor rebate filings, and keep a stash of hard-start kits for the radiators that refuse to retire.",
    p2: "24-hour emergency calls when the wind chill drops below zero. Filter-swap plan $14/mo.",
    age: "Yesterday",
  },
  {
    loc: "Brightline HVAC",
    locEm: "Atlanta",
    path: "/ga-atl",
    h: "Humidity is the real bill. We size the unit to beat it.",
    p1: "Georgia summers aren\u2019t just hot; the dew point does the work. Our Atlanta techs run Manual J loads on every install so you aren\u2019t running a 5-ton on a 1,800 square-foot ranch. Whole-house dehumidifiers paired right keep the power bill civilized.",
    p2: "Georgia Power rebates handled. Pollen-season filter upgrades included on spring tune-ups.",
    age: "3 days ago",
  },
  {
    loc: "Brightline HVAC",
    locEm: "Austin",
    path: "/tx-austin",
    h: "Texas grid. Texas heat. Systems built for both.",
    p1: "After Uri and every summer since, Austin homeowners want systems that survive brownouts. We install variable-speed compressors with soft-start kits, pair with Generac or Tesla Powerwall cutovers, and size for the upper-90s dew points that come with every August.",
    p2: "Austin Energy rebates filed for you. ERCOT conservation-alert mode available on smart thermostats.",
    age: "Today",
  },
  {
    loc: "Brightline HVAC",
    locEm: "Los Angeles",
    path: "/ca-la",
    h: "Title 24 is complicated. The bid doesn\u2019t have to be.",
    p1: "Silver Lake Spanish revivals, Eagle Rock bungalows, Valley ranch homes. Each needs a different answer. Our LA crews know Title 24 HERS testing, SCE rebate timing, and how to sneak a condenser into a zero-setback side yard. All-electric retrofits a specialty.",
    p2: "Permit pulls with LADBS handled. Wildfire-season MERV 13 filtration included.",
    age: "Yesterday",
  },
];

/* Pin positions keyed to US map layout */
const pins: { code: string; left: string; top: string; label: string }[] = [
  { code: "MSA", left: "22%", top: "58%", label: "View Mesa copy" },
  { code: "PDX", left: "18%", top: "26%", label: "View Portland copy" },
  { code: "DEN", left: "34%", top: "46%", label: "View Denver copy" },
  { code: "CHI", left: "62%", top: "32%", label: "View Chicago NW copy" },
  { code: "ATL", left: "74%", top: "58%", label: "View Atlanta copy" },
  { code: "AUS", left: "48%", top: "72%", label: "View Austin copy" },
  { code: "LA", left: "12%", top: "52%", label: "View Los Angeles copy" },
];

/* Ticker names */
const tickerNames = [
  "Brightline HVAC",
  "Riverstone Plumbing",
  "Halfmoon Garage Doors",
  "Saltbox Pest",
  "North Fork Electric",
  "Rivet Roofing",
  "Otter & Oak Lawn",
  "Copper Creek Cleaning",
];

/* Hero tilt cards */
const tiltCards = [
  {
    rotate: "-2deg",
    mr: "16px",
    ml: "0",
    meta: "Brightline HVAC \u00b7 Mesa",
    path: "/az-mesa",
    h: "Mesa summers are brutal. Your AC shouldn\u2019t be the reason.",
    age: "Refreshed 2 days ago",
  },
  {
    rotate: "1.5deg",
    mr: "0",
    ml: "16px",
    meta: "Riverstone Plumbing \u00b7 Frisco",
    path: "/tx-frisco",
    h: "Hard-water country. Softer install times than the big guys.",
    age: "Refreshed today",
  },
  {
    rotate: "-1deg",
    mr: "6px",
    ml: "0",
    meta: "Brightline HVAC \u00b7 Tampa",
    path: "/fl-tampa",
    h: "Humidity is the villain. We size the unit to beat it.",
    age: "Refreshed 4 days ago",
  },
];

/* ------------------------------------------------------------------ */
/*  Wrap helper — max-width 1240px, 48px padding, 24px under 720px    */
/* ------------------------------------------------------------------ */

const WRAP = "mx-auto max-w-[1240px] px-12 max-[720px]:px-6";

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [activePin, setActivePin] = useState(0);
  const demo = demos[activePin];

  return (
    <>
      {/* ====== NAV ====== */}
      <nav
        className="sticky top-0 z-50 bg-white"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div className={`${WRAP} flex items-center justify-between h-[68px]`}>
          <a href="#" className="flex items-center gap-3">
            <SliceMark className="w-9 h-9 text-pulp overflow-visible" />
            <span className="font-display font-[800] text-2xl tracking-[-0.03em] leading-none">
              Pulp
            </span>
          </a>

          <div className="hidden min-[821px]:flex gap-7 text-xs text-ink-70 font-mono">
            <a href="#how" className="hover:text-ink transition-colors">
              How
            </a>
            <a href="#features" className="hover:text-ink transition-colors">
              Features
            </a>
            <a href="#demo" className="hover:text-ink transition-colors">
              Demo
            </a>
            <a href="#compare" className="hover:text-ink transition-colors">
              vs. Templates
            </a>
          </div>

          <div className="flex gap-2">
            <a
              href="/sign-in"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-medium tracking-[0.04em] border border-line text-ink hover:border-ink transition-all"
            >
              Sign in
            </a>
            <a
              href="/sign-in"
              className="group inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-medium tracking-[0.04em] bg-ink text-white border border-transparent hover:bg-pulp hover:text-ink hover:-translate-y-px transition-all duration-200"
            >
              Start free{" "}
              <ArrowIcon className="transition-transform group-hover:translate-x-[3px]" />
            </a>
          </div>
        </div>
      </nav>

      {/* ====== HERO ====== */}
      <section className="pt-20 pb-[120px] relative">
        <div
          className={`${WRAP} grid grid-cols-[1.25fr_1fr] max-[900px]:grid-cols-1 gap-20 max-[900px]:gap-10 items-center`}
        >
          {/* Left */}
          <div>
            <div className="flex items-center gap-2.5 text-[11px] tracking-[0.22em] uppercase text-ink-70 mb-8">
              <span
                className="w-2.5 h-2.5 rounded-full bg-pulp inline-block"
                style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
              />
              The copy engine for multi-location brands
            </div>
            <h1
              className="font-display font-[800] leading-[0.88] tracking-[-0.035em] mb-7"
              style={{ fontSize: "clamp(56px, 7.2vw, 108px)" }}
            >
              <span className="block">Fresh-squeezed</span>
              <span className="block">
                <span className="font-display font-normal tracking-[-0.025em] text-pulp-deep">
                  copy
                </span>
                , for every
              </span>
              <span className="block">
                <span className="relative inline-block">
                  location
                  <Squiggle />
                </span>
                .
              </span>
            </h1>
            <p className="text-base leading-[1.55] text-ink-70 max-w-[46ch] mb-10 font-mono">
              Pulp writes local landing pages, service pages, and ad copy for
              every franchise territory. In your voice, tuned to the
              neighborhood, refreshed weekly.
            </p>
            <div className="flex gap-2.5 items-center flex-wrap">
              <a
                href="/sign-in"
                className="group inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-medium tracking-[0.04em] bg-ink text-white border border-transparent hover:bg-pulp hover:text-ink hover:-translate-y-px transition-all duration-200"
              >
                Start pressing{" "}
                <ArrowIcon className="transition-transform group-hover:translate-x-[3px]" />
              </a>
              <a
                href="#"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-medium tracking-[0.04em] border border-line text-ink hover:border-ink transition-all"
              >
                Watch 90 sec demo
              </a>
            </div>
          </div>

          {/* Right — tilt cards */}
          <div className="flex flex-col gap-3.5 relative min-w-0">
            {tiltCards.map((card, i) => (
              <div
                key={i}
                className="border-[1.5px] border-ink rounded-[14px] bg-white p-[18px_20px] flex flex-col gap-1.5 relative"
                style={{
                  boxShadow: "6px 6px 0 0 var(--ink)",
                  transform: `rotate(${card.rotate})`,
                  marginRight: card.mr,
                  marginLeft: card.ml,
                }}
              >
                <div className="flex justify-between text-[10px] tracking-[0.2em] uppercase text-ink-70 font-mono">
                  <span>{card.meta}</span>
                  <span>{card.path}</span>
                </div>
                <div className="font-display font-normal text-xl leading-[1.1] tracking-[-0.01em]">
                  {card.h}
                </div>
                <div className="flex justify-between text-[10px] tracking-[0.2em] uppercase text-ink-70 font-mono">
                  <span className="flex items-center gap-1.5">
                    <span className="w-[7px] h-[7px] rounded-full bg-pulp inline-block" />
                    {card.age}
                  </span>
                  <span>Live</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== TICKER ====== */}
      <div
        className="overflow-hidden py-3.5 bg-ink text-white"
        style={{
          borderTop: "1.5px solid var(--ink)",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <div
          className="flex gap-10 whitespace-nowrap font-display font-[800] text-[22px] tracking-[-0.02em]"
          style={{ animation: "ticker-scroll 35s linear infinite" }}
        >
          {[...tickerNames, ...tickerNames].map((name, i) => (
            <span key={i} className="inline-flex items-center gap-10">
              {name}
              <span className="font-normal text-lg">&#10033;</span>
            </span>
          ))}
        </div>
      </div>

      {/* ====== HOW IT WORKS ====== */}
      <section
        id="how"
        className="py-[140px] relative overflow-hidden"
        style={{ borderBottom: "1.5px solid var(--ink)" }}
      >
        <div className={WRAP}>
          {/* Head */}
          <div className="grid grid-cols-[180px_1fr] max-[820px]:grid-cols-1 gap-10 max-[820px]:gap-5 mb-20 max-[820px]:mb-14 items-start">
            <div className="text-[11px] tracking-[0.24em] uppercase text-ink font-mono">
              <span className="inline-block border-[1.5px] border-ink rounded-full px-2.5 py-1 mr-2">
                01
              </span>
              How it works
            </div>
            <h2
              className="font-display font-[800] leading-[0.88] tracking-[-0.035em] m-0"
              style={{ fontSize: "clamp(40px, 5.6vw, 80px)" }}
            >
              Three steps.
              <br />
              <span className="font-display font-normal tracking-[-0.025em] text-pulp-deep">
                Pulp
              </span>{" "}
              does the squeezing.
            </h2>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-3 max-[820px]:grid-cols-1 gap-5">
            {[
              {
                title: "Plug in your territories.",
                body: "CSV or Google Business Profile. Pulp pulls the service area, trades, hours, and local signals automatically.",
                tag: "5-min setup",
                dark: false,
              },
              {
                title: "Tune your voice.",
                body: "Drop three samples of copy you love. Pulp fingerprints the tone and holds the line on every service page it writes.",
                tag: "Voice locked",
                dark: true,
              },
              {
                title: "Press publish.",
                body: "Approve in bulk, tweak inline, or auto-publish weekly. Your territory pages never go stale again.",
                tag: "Ship weekly",
                dark: false,
              },
            ].map((step, i) => (
              <div
                key={i}
                className={`border-[1.5px] border-ink rounded-[18px] p-[22px_24px] flex flex-col gap-3 transition-all duration-200 cursor-default ${
                  step.dark ? "bg-ink text-white" : "bg-white"
                }`}
                style={{
                  boxShadow: step.dark
                    ? "8px 8px 0 0 #fff, 8px 8px 0 1.5px var(--ink)"
                    : "8px 8px 0 0 var(--ink)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translate(-2px, -2px)";
                  e.currentTarget.style.boxShadow = step.dark
                    ? "10px 10px 0 0 #fff, 10px 10px 0 1.5px var(--ink)"
                    : "10px 10px 0 0 var(--ink)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "";
                  e.currentTarget.style.boxShadow = step.dark
                    ? "8px 8px 0 0 #fff, 8px 8px 0 1.5px var(--ink)"
                    : "8px 8px 0 0 var(--ink)";
                }}
              >
                <h3 className="font-display font-normal text-[28px] leading-[1.1] tracking-[-0.01em] m-0">
                  {step.title}
                </h3>
                <p
                  className={`text-[13px] leading-[1.6] m-0 font-mono ${
                    step.dark ? "text-white/75" : "text-ink-70"
                  }`}
                >
                  {step.body}
                </p>
                <div
                  className={`mt-auto text-[10px] tracking-[0.22em] uppercase flex items-center gap-2 font-mono ${
                    step.dark ? "text-white/55" : "text-ink-40"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full inline-block ${
                      step.dark ? "bg-white" : "bg-pulp"
                    }`}
                  />
                  {step.tag}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== FEATURES ====== */}
      <section
        id="features"
        className="py-[140px] relative overflow-hidden"
        style={{
          borderBottom: "1.5px solid var(--ink)",
          background: "var(--cream)",
        }}
      >
        <div className={WRAP}>
          {/* Head */}
          <div className="grid grid-cols-[180px_1fr] max-[820px]:grid-cols-1 gap-10 max-[820px]:gap-5 mb-20 max-[820px]:mb-14 items-start">
            <div className="text-[11px] tracking-[0.24em] uppercase text-ink font-mono">
              <span className="inline-block border-[1.5px] border-ink rounded-full px-2.5 py-1 mr-2">
                02
              </span>
              What&apos;s inside
            </div>
            <h2
              className="font-display font-[800] leading-[0.88] tracking-[-0.035em] m-0"
              style={{ fontSize: "clamp(40px, 5.6vw, 80px)" }}
            >
              A loud little{" "}
              <span className="font-display font-normal tracking-[-0.025em] text-pulp-deep">
                pressroom
              </span>{" "}
              for franchise copy.
            </h2>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-3 max-[820px]:grid-cols-1 gap-4">
            {/* F/01 — wide, dark */}
            <div className="col-span-2 max-[820px]:col-span-1 border-[1.5px] border-ink rounded-[18px] bg-ink text-white p-7 min-h-[280px] flex flex-col gap-3.5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-[3px]">
              <h4 className="font-display font-[800] text-[32px] leading-none tracking-[-0.02em] m-0">
                Your voice,{" "}
                <em className="font-normal">held to the rind.</em>
              </h4>
              <p className="text-[13px] leading-[1.55] text-white/75 m-0 font-mono">
                Upload past copy once. Pulp extracts a fingerprint across six
                tone dimensions (cadence, vocabulary, forbidden words, mood) and
                enforces it on every service page and ad that ships.
              </p>
              <div
                className="mt-auto h-[100px] flex items-center justify-center text-white"
                aria-hidden="true"
              >
                <svg viewBox="0 0 260 80" width="100%" height="100%">
                  <path
                    d="M10 40 Q 30 15, 55 40 T 100 40 Q 130 5, 160 40 T 210 40 Q 230 20, 250 40"
                    stroke="#fff"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <g fill="#fff">
                    <circle cx="55" cy="40" r="3" />
                    <circle cx="100" cy="40" r="3" />
                    <circle cx="160" cy="40" r="3" />
                    <circle cx="210" cy="40" r="3" />
                  </g>
                </svg>
              </div>
            </div>

            {/* F/02 */}
            <div className="border-[1.5px] border-ink rounded-[18px] bg-white p-7 min-h-[280px] flex flex-col gap-3.5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-[3px]">
              <h4 className="font-display font-[800] text-[32px] leading-none tracking-[-0.02em] m-0">
                Territory <em className="font-normal">aware.</em>
              </h4>
              <p className="text-[13px] leading-[1.55] text-ink-70 m-0 font-mono">
                Every page knows its ZIP. Climate, housing stock, permits,
                seasonal demand.
              </p>
              <div
                className="mt-auto h-[100px] flex items-center justify-center text-ink"
                aria-hidden="true"
              >
                <svg viewBox="0 0 180 80" width="100%" height="100%">
                  <g fill="none" stroke="currentColor" strokeWidth="1.2">
                    <rect x="10" y="10" width="160" height="60" rx="6" />
                    <line x1="60" y1="10" x2="60" y2="70" opacity="0.3" />
                    <line x1="110" y1="10" x2="110" y2="70" opacity="0.3" />
                    <line x1="10" y1="40" x2="170" y2="40" opacity="0.3" />
                  </g>
                  <g fill="currentColor">
                    <circle cx="40" cy="28" r="4" />
                    <circle cx="90" cy="52" r="4" />
                    <circle cx="140" cy="30" r="4" />
                  </g>
                </svg>
              </div>
            </div>

            {/* F/03 — full width */}
            <div className="col-span-3 max-[820px]:col-span-1 border-[1.5px] border-ink rounded-[18px] bg-white p-7 min-h-[280px] flex flex-col gap-3.5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-[3px]">
              <h4 className="font-display font-[800] text-[32px] leading-none tracking-[-0.02em] m-0">
                Never-stale.{" "}
                <em className="font-normal">Refreshed weekly.</em>
              </h4>
              <p className="text-[13px] leading-[1.55] text-ink-70 m-0 font-mono">
                Seasonal, event-aware, inventory-aware. Google notices; so do
                your regulars.
              </p>
              <div
                className="mt-auto h-[100px] flex items-center justify-center text-ink w-full"
                aria-hidden="true"
              >
                <svg viewBox="0 0 260 60" width="100%" height="100%">
                  <g
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="none"
                    opacity="0.35"
                  >
                    <line x1="0" y1="30" x2="260" y2="30" />
                  </g>
                  <g>
                    <circle cx="20" cy="30" r="5" fill="currentColor" />
                    <circle cx="70" cy="30" r="5" fill="currentColor" />
                    <circle cx="120" cy="30" r="5" fill="currentColor" />
                    <circle cx="170" cy="30" r="5" fill="currentColor" />
                    <circle cx="220" cy="30" r="5" fill="currentColor" />
                  </g>
                  <g
                    fontFamily="var(--font-mono), monospace"
                    fontSize="8"
                    fill="currentColor"
                    opacity="0.55"
                  >
                    <text x="20" y="50" textAnchor="middle">
                      W01
                    </text>
                    <text x="70" y="50" textAnchor="middle">
                      W02
                    </text>
                    <text x="120" y="50" textAnchor="middle">
                      W03
                    </text>
                    <text x="170" y="50" textAnchor="middle">
                      W04
                    </text>
                    <text x="220" y="50" textAnchor="middle">
                      W05
                    </text>
                  </g>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== DEMO ====== */}
      <section
        id="demo"
        className="py-[140px] relative overflow-hidden"
        style={{ borderBottom: "1.5px solid var(--ink)" }}
      >
        <div className={WRAP}>
          {/* Head */}
          <div className="grid grid-cols-[180px_1fr] max-[820px]:grid-cols-1 gap-10 max-[820px]:gap-5 mb-20 max-[820px]:mb-14 items-start">
            <div className="text-[11px] tracking-[0.24em] uppercase text-ink font-mono">
              <span className="inline-block border-[1.5px] border-ink rounded-full px-2.5 py-1 mr-2">
                03
              </span>
              See it live
            </div>
            <h2
              className="font-display font-[800] leading-[0.88] tracking-[-0.035em] m-0"
              style={{ fontSize: "clamp(40px, 5.6vw, 80px)" }}
            >
              Click a pin.
              <br />
              Read the{" "}
              <span className="font-display font-normal tracking-[-0.025em] text-pulp-deep">
                copy.
              </span>
            </h2>
          </div>

          {/* Map + Output */}
          <div className="grid grid-cols-[1fr_1.05fr] max-[900px]:grid-cols-1 gap-5">
            {/* Map */}
            <div
              className="relative border-[1.5px] border-ink rounded-[18px] bg-white overflow-hidden"
              style={{
                aspectRatio: "4 / 3",
                backgroundImage:
                  "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            >
              {pins.map((pin, i) => (
                <button
                  key={pin.code}
                  onClick={() => setActivePin(i)}
                  aria-label={pin.label}
                  className={`absolute w-8 h-8 rounded-full border-[1.5px] border-ink flex items-center justify-center font-display font-[800] text-[11px] -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-[180ms] ${
                    activePin === i
                      ? "bg-ink text-white"
                      : "bg-white text-ink hover:bg-ink hover:text-white"
                  }`}
                  style={{
                    left: pin.left,
                    top: pin.top,
                    boxShadow:
                      activePin === i
                        ? "0 0 0 6px rgba(20,18,16,0.08)"
                        : "none",
                  }}
                >
                  {pin.code}
                </button>
              ))}
            </div>

            {/* Output card */}
            <div
              className="border-[1.5px] border-ink rounded-[18px] bg-white p-7 flex flex-col gap-[18px] min-h-full"
              style={{ boxShadow: "6px 6px 0 0 var(--ink)" }}
            >
              <div
                className="flex justify-between items-baseline pb-3.5"
                style={{ borderBottom: "1.5px dashed var(--ink)" }}
              >
                <span className="font-display font-[800] text-[22px] tracking-[-0.02em]">
                  {demo.loc} &middot;{" "}
                  <em className="font-normal">{demo.locEm}</em>
                </span>
                <span className="text-[10px] tracking-[0.2em] uppercase text-ink-70 font-mono">
                  {demo.path}
                </span>
              </div>
              <h5 className="font-display font-normal text-[28px] leading-[1.15] tracking-[-0.01em] m-0">
                {demo.h}
              </h5>
              <p className="text-[13px] leading-[1.65] text-ink m-0 max-w-[48ch] font-mono">
                {demo.p1}
              </p>
              <p className="text-[13px] leading-[1.65] text-ink m-0 max-w-[48ch] font-mono">
                {demo.p2}
              </p>
              <div
                className="mt-auto flex justify-between pt-3.5 text-[10px] tracking-[0.22em] uppercase text-ink-70 font-mono"
                style={{ borderTop: "1.5px dashed var(--ink)" }}
              >
                <span>Voice &middot; Brightline HVAC</span>
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <span className="w-1.5 h-1.5 bg-pulp rounded-full inline-block" />
                  Refreshed {demo.age}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== COMPARE ====== */}
      <section
        id="compare"
        className="py-[140px] relative overflow-hidden"
        style={{ borderBottom: "1.5px solid var(--ink)" }}
      >
        <div className={WRAP}>
          {/* Head */}
          <div className="grid grid-cols-[180px_1fr] max-[820px]:grid-cols-1 gap-10 max-[820px]:gap-5 mb-20 max-[820px]:mb-14 items-start">
            <div className="text-[11px] tracking-[0.24em] uppercase text-ink font-mono">
              <span className="inline-block border-[1.5px] border-ink rounded-full px-2.5 py-1 mr-2">
                04
              </span>
              Pulp vs. Templates
            </div>
            <h2
              className="font-display font-[800] leading-[0.88] tracking-[-0.035em] m-0"
              style={{ fontSize: "clamp(40px, 5.6vw, 80px)" }}
            >
              Local pages that sound{" "}
              <span className="font-display font-normal tracking-[-0.025em] text-pulp-deep">
                human
              </span>
              , not stamped.
            </h2>
          </div>

          {/* Compare cards */}
          <div className="grid grid-cols-2 max-[820px]:grid-cols-1 gap-5">
            {/* Templates (left) */}
            <div className="border-[1.5px] border-ink rounded-[18px] p-8 bg-white">
              <h3 className="font-display font-[800] text-[36px] tracking-[-0.02em] m-0 mb-6 leading-none">
                Templates.
              </h3>
              <ul className="list-none p-0 m-0 flex flex-col gap-3">
                {[
                  "Same paragraph, 400 territories",
                  "\u201c[Services] in [City]\u201d meta tags",
                  "Dead-give-away phrasing",
                  "Quarterly manual re-writes",
                  "Doorway-page risk with Google",
                  "No voice control",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex gap-3 items-start text-sm leading-[1.5] py-2.5 text-ink-70 line-through font-mono"
                    style={{
                      borderBottom: "1px dashed var(--ink)",
                      textDecorationColor: "var(--ink-40)",
                    }}
                  >
                    <span className="flex-none w-5 h-5 rounded-full flex items-center justify-center font-display font-[800] text-sm bg-white text-ink border-[1.5px] border-ink -mt-px">
                      &times;
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pulp (right, dark) */}
            <div
              className="border-[1.5px] border-ink rounded-[18px] p-8 bg-ink text-white"
              style={{
                boxShadow: "8px 8px 0 0 var(--ink)",
                transform: "rotate(-0.8deg)",
              }}
            >
              <h3 className="font-display font-[800] text-[36px] tracking-[-0.02em] m-0 mb-6 leading-none">
                <em className="font-normal">Pulp</em>
              </h3>
              <ul className="list-none p-0 m-0 flex flex-col gap-3">
                {[
                  "Every page written from scratch",
                  "Neighborhood-aware openings",
                  "Voice fingerprint locked to brand",
                  "Weekly automatic refresh",
                  "Human-in-the-loop approval",
                  "Publishes direct to your stack",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex gap-3 items-start text-sm leading-[1.5] py-2.5 font-mono"
                    style={{
                      borderBottom: "1px dashed rgba(255,255,255,0.35)",
                    }}
                  >
                    <span className="flex-none w-5 h-5 rounded-full flex items-center justify-center font-display font-[800] text-sm bg-white text-ink -mt-px">
                      &#10022;
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ====== QUOTE ====== */}
      <section
        className="bg-ink text-white py-[140px] relative overflow-hidden"
        style={{
          borderTop: "1.5px solid var(--ink)",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <div
          className="absolute right-[-40px] top-[-20px] text-[220px] font-display leading-none select-none"
          style={{ color: "#1f1c19" }}
          aria-hidden="true"
        >
          &#10033;
        </div>
        <div className={`${WRAP} relative z-[2]`}>
          <blockquote
            className="font-display font-normal leading-[1.05] tracking-[-0.025em] max-w-[24ch] m-0"
            style={{ fontSize: "clamp(40px, 5.2vw, 76px)" }}
          >
            We shipped{" "}
            <span className="font-[800]">412 territory pages</span> in a
            weekend. Organic leads{" "}
            <em className="text-pulp">doubled</em> in five weeks. Every page
            reads like our local crews wrote it.
          </blockquote>
          <div className="mt-11 flex gap-3.5 items-center text-[11px] tracking-[0.2em] uppercase text-white/70 font-mono">
            <div className="w-11 h-11 rounded-full bg-white text-ink flex items-center justify-center font-display font-[800] text-xl">
              M
            </div>
            <div>
              <div className="font-display font-[800] text-base tracking-[-0.01em] text-white normal-case mb-1">
                Maya Ortiz
              </div>
              VP Marketing &middot; Brightline HVAC &middot; 89 franchisees
            </div>
          </div>
        </div>
      </section>

      {/* ====== BIG CTA ====== */}
      <section
        className="pt-[180px] pb-[160px] text-left relative overflow-hidden"
        style={{
          background: "var(--cream)",
          borderTop: "1.5px solid var(--ink)",
        }}
      >
        <SliceMark className="absolute right-[-80px] top-1/2 -translate-y-1/2 w-[560px] h-[560px] text-pulp overflow-visible max-[900px]:w-[300px] max-[900px]:h-[300px] max-[900px]:right-[-80px] max-[900px]:opacity-55" />
        <div className={`${WRAP} relative z-[2]`}>
          <h2
            className="font-display font-[800] leading-[0.88] tracking-[-0.045em] mb-11 m-0"
            style={{ fontSize: "clamp(64px, 9vw, 140px)" }}
          >
            Start{" "}
            <span className="font-display font-normal text-pulp-deep">
              squeezing.
            </span>
          </h2>
          <div className="flex gap-3 items-center flex-wrap">
            <a
              href="/sign-in"
              className="group inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-medium tracking-[0.04em] bg-ink text-white border border-transparent hover:bg-pulp hover:text-ink hover:-translate-y-px transition-all duration-200"
            >
              Press publish free{" "}
              <ArrowIcon className="transition-transform group-hover:translate-x-[3px]" />
            </a>
            <a
              href="#"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-medium tracking-[0.04em] border border-line text-ink hover:border-ink transition-all"
            >
              Book a 15-min tour
            </a>
          </div>
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer
        className="bg-ink text-white pt-16 pb-8"
        style={{ borderTop: "1.5px solid var(--ink)" }}
      >
        <div
          className={`${WRAP} grid grid-cols-[2fr_1fr_1fr_1fr] max-[820px]:grid-cols-2 gap-12`}
        >
          {/* Brand */}
          <div>
            <a href="#" className="flex items-center gap-3">
              <SliceMark className="w-9 h-9 text-pulp overflow-visible" />
              <span className="font-display font-[800] text-2xl tracking-[-0.03em] leading-none text-white">
                Pulp
              </span>
            </a>
            <p className="text-[13px] text-white/70 max-w-[36ch] mt-[18px] leading-[1.55] font-mono">
              Fresh-squeezed copy for every franchise territory. Built for
              operators, loved by marketers.
            </p>
          </div>

          {/* Product */}
          <div>
            <h5 className="text-[10px] tracking-[0.22em] uppercase text-white/50 m-0 mb-4 font-medium font-mono">
              Product
            </h5>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
              {["How it works", "Features", "Integrations", "Changelog"].map(
                (link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-[13px] text-white/85 hover:text-white transition-colors font-mono"
                    >
                      {link}
                    </a>
                  </li>
                )
              )}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h5 className="text-[10px] tracking-[0.22em] uppercase text-white/50 m-0 mb-4 font-medium font-mono">
              Company
            </h5>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
              {["About", "Customers", "Careers", "Press kit", "Contact"].map(
                (link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-[13px] text-white/85 hover:text-white transition-colors font-mono"
                    >
                      {link}
                    </a>
                  </li>
                )
              )}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h5 className="text-[10px] tracking-[0.22em] uppercase text-white/50 m-0 mb-4 font-medium font-mono">
              Resources
            </h5>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
              {["Docs", "API", "Voice guide", "Security", "Status"].map(
                (link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-[13px] text-white/85 hover:text-white transition-colors font-mono"
                    >
                      {link}
                    </a>
                  </li>
                )
              )}
            </ul>
          </div>

          {/* Bottom bar */}
          <div
            className="col-span-full mt-12 pt-6 flex justify-between text-[10px] tracking-[0.2em] uppercase text-white/50 flex-wrap gap-4 font-mono"
            style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}
          >
            <span>&copy; 2026 Pulp Copy, Inc.</span>
            <span>Fresh-squeezed. Never from concentrate.</span>
            <span>Privacy &middot; Terms &middot; DPA</span>
          </div>
        </div>
      </footer>
    </>
  );
}
