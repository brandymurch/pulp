"use client";

import { useState } from "react";
import { SliceMark, ArrowIcon } from "@/components/shared/Icons";

function Squiggle() {
  return (
    <svg
      viewBox="0 0 200 10"
      preserveAspectRatio="none"
      className="absolute left-[-2%] right-[-2%] bottom-[-0.18em] w-[104%] h-[0.32em]"
      style={{ color: "var(--ink)" }}
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
/*  Demo data                                                          */
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
    loc: "ProShield",
    locEm: "Mission",
    path: "/sf-mission",
    h: "Victorian row houses, fog-season moisture, and termites that never left the 1906 foundations.",
    p1: "San Francisco\u2019s Mission District runs warm and dry by local standards, which is exactly what drywood termites prefer. The Victorians on Guerrero and Valencia sit on pier-and-post foundations with original redwood framing. We inspect from the subfloor up, treat with localized heat, and warranty the work for five years.",
    p2: "Same-day inspections available Tuesday through Saturday. Two blocks from 24th St BART.",
    age: "2 days ago",
  },
  {
    loc: "BrightHome",
    locEm: "Alberta",
    path: "/pdx-alberta",
    h: "Portland rain gets in. We keep the heat from getting out.",
    p1: "Alberta Street homes were mostly built in the 1920s with balloon framing and zero vapor barrier. That means forty-degree mornings in January hit your furnace before they hit the thermostat. We blow dense-pack cellulose into wall cavities without removing siding, seal the attic plane, and cut heating bills by a third on average.",
    p2: "Free energy audit for Alberta Arts District homeowners. Book online or call before 5 PM.",
    age: "4 days ago",
  },
  {
    loc: "CleanSlate",
    locEm: "LoHi",
    path: "/den-lohi",
    h: "Altitude dries everything faster. Including your patience after a burst pipe.",
    p1: "Denver\u2019s low humidity is a gift for drying but a curse for timing. Water damage at 5,280 feet wicks into drywall and subfloor faster than sea-level crews expect. Our LoHi team runs commercial dehumidifiers and thermal imaging within two hours of your call, document everything for insurance, and handle the rebuild from studs to paint.",
    p2: "24/7 emergency line. Licensed, bonded, and insured in Colorado since 2014.",
    age: "Today",
  },
  {
    loc: "ProShield",
    locEm: "Logan Sq",
    path: "/chi-logan",
    h: "Chicago rats are bold. Our bait stations are bolder.",
    p1: "Logan Square sits between the 606 trail and the Kennedy, which means rodent pressure from both green corridors and commercial waste. We run a four-visit quarterly program: perimeter bait stations, interior snap traps, entry-point exclusion with copper mesh, and a follow-up thermal scan to confirm clearance. No contracts longer than a year.",
    p2: "Winter mouse season starts in October. Book your fall exclusion before the first freeze.",
    age: "Yesterday",
  },
  {
    loc: "BrightHome",
    locEm: "Old Fourth",
    path: "/atl-o4w",
    h: "Atlanta summers start in April. Your attic already knows.",
    p1: "Old Fourth Ward bungalows and new BeltLine condos share the same problem: an attic that hits 150\u00b0 by June. We install radiant barrier and blow R-38 fiberglass on the attic floor, cutting cooling costs and taking load off your HVAC. Georgia Power rebates cover up to $500 of the job.",
    p2: "Walk-in estimates at our Irwin Street office, or we come to you. Free for O4W residents.",
    age: "3 days ago",
  },
  {
    loc: "CleanSlate",
    locEm: "East Side",
    path: "/aus-east",
    h: "Texas storms flood fast. We show up faster.",
    p1: "East Austin\u2019s clay soil doesn\u2019t drain. When a spring storm drops three inches in an hour, water pools against slab foundations and pushes through weep holes into living spaces. Our crew arrives with extractors and air movers the same day, maps the moisture with FLIR cameras, and files your insurance claim before we leave.",
    p2: "Serving East Austin, Mueller, and Manor Road. Hablamos espa\u00f1ol.",
    age: "Today",
  },
  {
    loc: "ProShield",
    locEm: "Silver Lake",
    path: "/la-silverlake",
    h: "Hillside homes, canyon brush, and the rodents that come with both.",
    p1: "Silver Lake\u2019s steep lots back up to wild hillside, which means roof rats, field mice, and the occasional opossum finding gaps in Spanish tile and stucco. We seal every entry point with galvanized steel, set monitored bait stations along the slope line, and clear attic contamination if they already got comfortable.",
    p2: "Serving Silver Lake, Echo Park, and Los Feliz. Parking is still a myth, but we bring our own van.",
    age: "Yesterday",
  },
];

/* Pin positions keyed to US map layout */
const pins: { code: string; left: string; top: string }[] = [
  { code: "SF", left: "18%", top: "46%" },
  { code: "PDX", left: "22%", top: "26%" },
  { code: "DEN", left: "42%", top: "44%" },
  { code: "CHI", left: "62%", top: "30%" },
  { code: "ATL", left: "80%", top: "56%" },
  { code: "AUS", left: "50%", top: "72%" },
  { code: "LA", left: "26%", top: "62%" },
];

/* Ticker names */
const tickerNames = [
  "ProShield Pest Control",
  "BrightHome Insulation",
  "CleanSlate Restoration",
  "SparkClean Maids",
  "TrueLevel Foundations",
  "GreenEdge Landscaping",
  "PeakAir HVAC",
  "IronGate Roofing",
];

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
        <div className="mx-auto max-w-[1200px] px-10 max-[720px]:px-6 flex items-center justify-between h-[68px]">
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
              className="group inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-medium tracking-[0.04em] bg-ink text-white border border-transparent hover:-translate-y-px transition-transform"
            >
              Start free{" "}
              <ArrowIcon className="transition-transform group-hover:translate-x-[3px]" />
            </a>
          </div>
        </div>
      </nav>

      {/* ====== HERO ====== */}
      <section className="py-24 max-[900px]:py-16 relative">
        <div className="mx-auto max-w-[1200px] px-10 max-[720px]:px-6 grid grid-cols-[1.3fr_1fr] max-[900px]:grid-cols-1 gap-16 max-[900px]:gap-10 items-end">
          {/* Left */}
          <div>
            <div className="flex items-center gap-2.5 text-[11px] tracking-[0.22em] uppercase text-ink-70 mb-10">
              <span className="w-2 h-2 rounded-full bg-ink inline-block" />
              The copy engine for multi-location brands
            </div>
            <h1
              className="font-display font-[800] leading-[0.88] tracking-[-0.035em] mb-7"
              style={{ fontSize: "clamp(72px, 11vw, 168px)" }}
            >
              <span className="block">Fresh-squeezed</span>
              <span className="block">
                <span className="font-display italic font-normal tracking-[-0.015em]">
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
              each of your locations, in your voice, tuned to the neighborhood,
              refreshed weekly.
            </p>
            <div className="flex gap-2.5 items-center flex-wrap">
              <a
                href="/sign-in"
                className="group inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-medium tracking-[0.04em] bg-ink text-white border border-transparent hover:-translate-y-px transition-transform"
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
          <div className="flex flex-col gap-3.5 relative">
            {[
              {
                rotate: "-2deg",
                mr: "20px",
                ml: "0",
                meta: "ProShield \u00b7 Mission",
                path: "/sf-mission",
                h: "Victorian row houses, fog-season moisture, and termites that never left.",
                age: "Refreshed 2 days ago",
              },
              {
                rotate: "1.5deg",
                mr: "0",
                ml: "24px",
                meta: "BrightHome \u00b7 Alberta",
                path: "/pdx-alberta",
                h: "Portland rain gets in. We keep the heat from getting out.",
                age: "Refreshed today",
              },
              {
                rotate: "-1deg",
                mr: "8px",
                ml: "0",
                meta: "CleanSlate \u00b7 LoHi",
                path: "/den-lohi",
                h: "Altitude dries everything faster. Including your patience after a burst pipe.",
                age: "Refreshed 4 days ago",
              },
            ].map((card, i) => (
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
                <div className="flex justify-between text-[10px] tracking-[0.2em] uppercase text-ink-70">
                  <span>{card.meta}</span>
                  <span>{card.path}</span>
                </div>
                <div className="font-display italic font-normal text-xl leading-[1.1] tracking-[-0.01em]">
                  {card.h}
                </div>
                <div className="flex justify-between text-[10px] tracking-[0.2em] uppercase text-ink-70">
                  <span className="flex items-center gap-1.5">
                    <span className="w-[7px] h-[7px] rounded-full bg-ink inline-block" />
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
        <div className="mx-auto max-w-[1200px] px-10 max-[720px]:px-6">
          {/* Head */}
          <div className="grid grid-cols-[180px_1fr] max-[820px]:grid-cols-1 gap-10 max-[820px]:gap-5 mb-20 max-[820px]:mb-14 items-start">
            <div className="text-[11px] tracking-[0.24em] uppercase text-ink">
              <span className="inline-block border-[1.5px] border-ink rounded-full px-2.5 py-1 mr-2">
                01
              </span>
              How it works
            </div>
            <h2
              className="font-display font-[800] leading-[0.88] tracking-[-0.035em] m-0"
              style={{ fontSize: "clamp(44px, 6.8vw, 96px)" }}
            >
              Three steps.
              <br />
              <span className="font-display italic font-normal tracking-[-0.015em]">
                Pulp
              </span>{" "}
              does the squeezing.
            </h2>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-3 max-[820px]:grid-cols-1 gap-5">
            {[
              {
                n: "01",
                title: "Plug in your locations.",
                body: "CSV, Google Business Profile, or your CMS. Pulp pulls the neighborhood, hours, services, and local signals automatically.",
                tag: "5-min setup",
                dark: false,
              },
              {
                n: "02",
                title: "Tune your voice.",
                body: "Drop three samples of copy you love. Pulp fingerprints the tone and holds the line on every page it writes.",
                tag: "Voice locked",
                dark: true,
              },
              {
                n: "03",
                title: "Press publish.",
                body: "Approve in bulk, tweak inline, or auto-publish weekly. Your local pages never go stale again.",
                tag: "Ship weekly",
                dark: false,
              },
            ].map((step) => (
              <div
                key={step.n}
                className={`border-[1.5px] border-ink rounded-[20px] p-8 min-h-[300px] flex flex-col gap-5 transition-all duration-200 cursor-default ${
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
                <div className="font-display font-[800] text-[80px] leading-[0.9] tracking-[-0.04em]">
                  {step.n}
                </div>
                <h3 className="font-display italic font-normal text-[28px] leading-[1.1] tracking-[-0.01em] m-0">
                  {step.title}
                </h3>
                <p
                  className={`text-[13px] leading-[1.6] m-0 ${
                    step.dark ? "text-white/75" : "text-ink-70"
                  }`}
                >
                  {step.body}
                </p>
                <div
                  className={`mt-auto text-[10px] tracking-[0.22em] uppercase flex items-center gap-2 ${
                    step.dark ? "text-white/55" : "text-ink-40"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full inline-block ${
                      step.dark ? "bg-white" : "bg-ink"
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
        style={{ borderBottom: "1.5px solid var(--ink)" }}
      >
        <div className="mx-auto max-w-[1200px] px-10 max-[720px]:px-6">
          {/* Head */}
          <div className="grid grid-cols-[180px_1fr] max-[820px]:grid-cols-1 gap-10 max-[820px]:gap-5 mb-20 max-[820px]:mb-14 items-start">
            <div className="text-[11px] tracking-[0.24em] uppercase text-ink">
              <span className="inline-block border-[1.5px] border-ink rounded-full px-2.5 py-1 mr-2">
                02
              </span>
              What&apos;s inside
            </div>
            <h2
              className="font-display font-[800] leading-[0.88] tracking-[-0.035em] m-0"
              style={{ fontSize: "clamp(44px, 6.8vw, 96px)" }}
            >
              A loud little{" "}
              <span className="font-display italic font-normal tracking-[-0.015em]">
                pressroom
              </span>{" "}
              for local copy.
            </h2>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-3 max-[820px]:grid-cols-1 gap-4">
            {/* F/01 — wide, dark */}
            <div className="col-span-2 max-[820px]:col-span-1 border-[1.5px] border-ink rounded-[18px] bg-ink text-white p-7 min-h-[280px] flex flex-col gap-3.5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-[3px]">
              <div className="text-[10px] tracking-[0.22em] uppercase text-white/55">
                F / 01
              </div>
              <h4 className="font-display font-[800] text-[32px] leading-none tracking-[-0.02em] m-0">
                Your voice,{" "}
                <em className="font-normal italic">held to the rind.</em>
              </h4>
              <p className="text-[13px] leading-[1.55] text-white/75 m-0">
                Upload past copy once. Pulp extracts a fingerprint across six
                tone dimensions (cadence, vocabulary, forbidden words, mood)
                and enforces it on every word that ships.
              </p>
              <div className="mt-auto h-[100px] flex items-center justify-center text-white">
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
              <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70">
                F / 02
              </div>
              <h4 className="font-display font-[800] text-[32px] leading-none tracking-[-0.02em] m-0">
                Neighbor&shy;hood <em className="font-normal italic">aware.</em>
              </h4>
              <p className="text-[13px] leading-[1.55] text-ink-70 m-0">
                Every page knows its corner. Landmarks, transit, weather,
                seasonality.
              </p>
              <div className="mt-auto h-[100px] flex items-center justify-center text-ink">
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

            {/* F/03 */}
            <div className="border-[1.5px] border-ink rounded-[18px] bg-white p-7 min-h-[280px] flex flex-col gap-3.5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-[3px]">
              <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70">
                F / 03
              </div>
              <h4 className="font-display font-[800] text-[32px] leading-none tracking-[-0.02em] m-0">
                Ads + landings,{" "}
                <em className="font-normal italic">paired.</em>
              </h4>
              <p className="text-[13px] leading-[1.55] text-ink-70 m-0">
                Google &amp; Meta ad copy that matches the page it flies to.
              </p>
              <div className="mt-auto h-[100px] flex items-center justify-center text-ink">
                <svg viewBox="0 0 180 80" width="100%" height="100%">
                  <g fill="none" stroke="currentColor" strokeWidth="1.4">
                    <rect x="10" y="20" width="70" height="40" rx="4" />
                    <rect x="100" y="20" width="70" height="40" rx="4" />
                    <line
                      x1="80"
                      y1="40"
                      x2="100"
                      y2="40"
                      strokeDasharray="3 3"
                    />
                    <line x1="20" y1="32" x2="60" y2="32" />
                    <line x1="20" y1="42" x2="50" y2="42" opacity="0.6" />
                    <line x1="110" y1="32" x2="160" y2="32" />
                    <line x1="110" y1="42" x2="140" y2="42" opacity="0.6" />
                  </g>
                </svg>
              </div>
            </div>

            {/* F/04 */}
            <div className="border-[1.5px] border-ink rounded-[18px] bg-white p-7 min-h-[280px] flex flex-col gap-3.5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-[3px]">
              <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70">
                F / 04
              </div>
              <h4 className="font-display font-[800] text-[32px] leading-none tracking-[-0.02em] m-0">
                Ship <em className="font-normal italic">anywhere.</em>
              </h4>
              <p className="text-[13px] leading-[1.55] text-ink-70 m-0">
                WordPress, Webflow, Shopify, Contentful, Sanity, CSV, Zapier,
                API.
              </p>
              <div className="mt-auto h-[100px] flex items-center justify-center text-ink">
                <svg viewBox="0 0 180 80" width="100%" height="100%">
                  <g fill="none" stroke="currentColor" strokeWidth="1.4">
                    <rect x="10" y="8" width="28" height="20" rx="3" />
                    <rect x="46" y="8" width="28" height="20" rx="3" />
                    <rect x="82" y="8" width="28" height="20" rx="3" />
                    <rect x="118" y="8" width="28" height="20" rx="3" />
                    <rect x="154" y="8" width="16" height="20" rx="3" />
                    <path d="M90 30 L90 50" strokeDasharray="2 2" />
                    <rect
                      x="62"
                      y="50"
                      width="56"
                      height="22"
                      rx="11"
                      fill="currentColor"
                      stroke="none"
                    />
                  </g>
                  <text
                    x="90"
                    y="66"
                    textAnchor="middle"
                    fontFamily="var(--font-fraunces), serif"
                    fontWeight="800"
                    fontSize="12"
                    fill="#fff"
                  >
                    Pulp
                  </text>
                </svg>
              </div>
            </div>

            {/* F/05 — wide */}
            <div className="col-span-2 max-[820px]:col-span-1 border-[1.5px] border-ink rounded-[18px] bg-white p-7 min-h-[280px] flex flex-col gap-3.5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-[3px]">
              <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70">
                F / 05
              </div>
              <h4 className="font-display font-[800] text-[32px] leading-none tracking-[-0.02em] m-0">
                Never-stale.{" "}
                <em className="font-normal italic">Refreshed weekly.</em>
              </h4>
              <p className="text-[13px] leading-[1.55] text-ink-70 m-0">
                Seasonal, event-aware, inventory-aware. Google notices; so do
                your regulars.
              </p>
              <div className="mt-auto h-[100px] flex items-center justify-center text-ink w-full">
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
        <div className="mx-auto max-w-[1200px] px-10 max-[720px]:px-6">
          {/* Head */}
          <div className="grid grid-cols-[180px_1fr] max-[820px]:grid-cols-1 gap-10 max-[820px]:gap-5 mb-20 max-[820px]:mb-14 items-start">
            <div className="text-[11px] tracking-[0.24em] uppercase text-ink">
              <span className="inline-block border-[1.5px] border-ink rounded-full px-2.5 py-1 mr-2">
                03
              </span>
              See it live
            </div>
            <h2
              className="font-display font-[800] leading-[0.88] tracking-[-0.035em] m-0"
              style={{ fontSize: "clamp(44px, 6.8vw, 96px)" }}
            >
              Click a pin.
              <br />
              Read the{" "}
              <span className="font-display italic font-normal tracking-[-0.015em]">
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
                  <em className="font-normal italic">{demo.locEm}</em>
                </span>
                <span className="text-[10px] tracking-[0.2em] uppercase text-ink-70">
                  {demo.path}
                </span>
              </div>
              <h5 className="font-display italic font-normal text-[28px] leading-[1.15] tracking-[-0.01em] m-0">
                {demo.h}
              </h5>
              <p className="text-[13px] leading-[1.65] text-ink m-0 max-w-[48ch]">
                {demo.p1}
              </p>
              <p className="text-[13px] leading-[1.65] text-ink m-0 max-w-[48ch]">
                {demo.p2}
              </p>
              <div
                className="mt-auto flex justify-between pt-3.5 text-[10px] tracking-[0.22em] uppercase text-ink-70"
                style={{ borderTop: "1.5px dashed var(--ink)" }}
              >
                <span>Voice &middot; {demo.loc}</span>
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <span className="w-1.5 h-1.5 bg-ink rounded-full inline-block" />
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
        <div className="mx-auto max-w-[1200px] px-10 max-[720px]:px-6">
          {/* Head */}
          <div className="grid grid-cols-[180px_1fr] max-[820px]:grid-cols-1 gap-10 max-[820px]:gap-5 mb-20 max-[820px]:mb-14 items-start">
            <div className="text-[11px] tracking-[0.24em] uppercase text-ink">
              <span className="inline-block border-[1.5px] border-ink rounded-full px-2.5 py-1 mr-2">
                04
              </span>
              Pulp vs. Templates
            </div>
            <h2
              className="font-display font-[800] leading-[0.88] tracking-[-0.035em] m-0"
              style={{ fontSize: "clamp(44px, 6.8vw, 96px)" }}
            >
              Local pages that sound{" "}
              <span className="font-display italic font-normal tracking-[-0.015em]">
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
                  "Same paragraph, 400 cities",
                  "\u201c[Services] in [City]\u201d meta tags",
                  "Dead-give-away phrasing",
                  "Quarterly manual re-writes",
                  "Doorway-page risk with Google",
                  "No voice control",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex gap-3 items-start text-sm leading-[1.5] py-2.5 text-ink-70 line-through"
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
                <em className="font-normal italic">Pulp</em>
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
                    className="flex gap-3 items-start text-sm leading-[1.5] py-2.5"
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
        >
          &#10033;
        </div>
        <div className="mx-auto max-w-[1200px] px-10 max-[720px]:px-6 relative z-[2]">
          <blockquote
            className="font-display font-normal leading-[1.05] tracking-[-0.025em] max-w-[24ch] m-0"
            style={{ fontSize: "clamp(40px, 5.2vw, 76px)" }}
          >
            We launched{" "}
            <span className="font-[800]">83 city pages</span> in a single
            weekend. Organic leads <em className="italic">doubled</em> in five
            weeks, and every page reads like our local team wrote it.
          </blockquote>
          <div className="mt-11 flex gap-3.5 items-center text-[11px] tracking-[0.2em] uppercase text-white/70">
            <div className="w-11 h-11 rounded-full bg-white text-ink flex items-center justify-center font-display font-[800] text-xl">
              R
            </div>
            <div>
              <div className="font-display font-[800] text-base tracking-[-0.01em] text-white normal-case mb-1">
                Rachel Teague
              </div>
              VP Marketing &middot; ProShield Pest Control &middot; 83 territories
            </div>
          </div>
        </div>
      </section>

      {/* ====== BIG CTA ====== */}
      <section className="pt-[180px] pb-[160px] text-left relative overflow-hidden">
        <SliceMark className="absolute right-[-80px] top-1/2 -translate-y-1/2 w-[520px] h-[520px] text-pulp overflow-visible max-[900px]:w-[280px] max-[900px]:h-[280px] max-[900px]:right-[-60px] max-[900px]:opacity-50" />
        <div className="mx-auto max-w-[1200px] px-10 max-[720px]:px-6 relative z-[2]">
          <h2
            className="font-display font-[800] leading-[0.88] tracking-[-0.045em] mb-11 m-0"
            style={{ fontSize: "clamp(88px, 13vw, 200px)" }}
          >
            Start{" "}
            <span className="font-display italic font-normal text-ink">
              squeezing.
            </span>
          </h2>
          <div className="flex gap-3 items-center flex-wrap">
            <a
              href="/sign-in"
              className="group inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-medium tracking-[0.04em] bg-ink text-white border border-transparent hover:-translate-y-px transition-transform"
            >
              Press publish free{" "}
              <ArrowIcon className="transition-transform group-hover:translate-x-[3px]" />
            </a>
            <a
              href="/sign-in"
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
        <div className="mx-auto max-w-[1200px] px-10 max-[720px]:px-6 grid grid-cols-[2fr_1fr_1fr_1fr] max-[820px]:grid-cols-2 gap-12">
          {/* Brand */}
          <div>
            <a href="#" className="flex items-center gap-3">
              <SliceMark className="w-9 h-9 text-pulp overflow-visible" />
              <span className="font-display font-[800] text-2xl tracking-[-0.03em] leading-none text-white">
                Pulp
              </span>
            </a>
            <p className="text-[13px] text-white/70 max-w-[36ch] mt-[18px] leading-[1.55]">
              Fresh-squeezed copy for every location. Built for franchises,
              loved by operators.
            </p>
          </div>

          {/* Product */}
          <div>
            <h5 className="text-[10px] tracking-[0.22em] uppercase text-white/50 m-0 mb-4 font-medium">
              Product
            </h5>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
              {["How it works", "Features", "Integrations", "Changelog"].map(
                (link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-[13px] text-white/85 hover:text-white transition-colors"
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
            <h5 className="text-[10px] tracking-[0.22em] uppercase text-white/50 m-0 mb-4 font-medium">
              Company
            </h5>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
              {["About", "Customers", "Careers", "Press kit", "Contact"].map(
                (link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-[13px] text-white/85 hover:text-white transition-colors"
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
            <h5 className="text-[10px] tracking-[0.22em] uppercase text-white/50 m-0 mb-4 font-medium">
              Resources
            </h5>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
              {["Docs", "API", "Voice guide", "Security", "Status"].map(
                (link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-[13px] text-white/85 hover:text-white transition-colors"
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
            className="col-span-full mt-12 pt-6 flex justify-between text-[10px] tracking-[0.2em] uppercase text-white/50 flex-wrap gap-4"
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
