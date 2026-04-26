"use client";

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
            <p className="text-base leading-[1.55] text-ink-70 max-w-[46ch] mb-10 mt-4 font-mono">
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
          {[...[
            "Voice-matched copy",
            "SEO-scored drafts",
            "Territory-aware pages",
            "Weekly auto-refresh",
            "Bulk generation",
            "Outline approval",
            "Competitor analysis",
            "Local review integration",
          ], ...[
            "Voice-matched copy",
            "SEO-scored drafts",
            "Territory-aware pages",
            "Weekly auto-refresh",
            "Bulk generation",
            "Outline approval",
            "Competitor analysis",
            "Local review integration",
          ]].map((feature, i) => (
            <span key={i} className="inline-flex items-center gap-10">
              {feature}
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
          <div className="mb-20 max-[820px]:mb-14">
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
          <div className="mb-20 max-[820px]:mb-14">
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
            <div className="col-span-2 max-[820px]:col-span-1 border-[1.5px] border-ink rounded-[18px] bg-ink text-white p-7 flex flex-col gap-3.5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-[3px]">
              <h4 className="font-display font-[800] text-[32px] leading-none tracking-[-0.02em] m-0">
                Your voice,{" "}
                <em className="font-normal">held to the rind.</em>
              </h4>
              <p className="text-[13px] leading-[1.55] text-white/75 m-0 font-mono">
                Drop in samples of copy you love. Pulp learns the cadence,
                vocabulary, and guardrails, then holds the line on every page
                that ships.
              </p>
            </div>

            {/* F/02 */}
            <div className="border-[1.5px] border-ink rounded-[18px] bg-white p-7 flex flex-col gap-3.5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-[3px]">
              <h4 className="font-display font-[800] text-[32px] leading-none tracking-[-0.02em] m-0">
                Territory <em className="font-normal">aware.</em>
              </h4>
              <p className="text-[13px] leading-[1.55] text-ink-70 m-0 font-mono">
                Every page knows its ZIP. Climate, housing stock, permits,
                seasonal demand.
              </p>
            </div>

            {/* F/03 — full width */}
            <div className="col-span-3 max-[820px]:col-span-1 border-[1.5px] border-ink rounded-[18px] bg-white p-7 flex flex-col gap-3.5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-[3px]">
              <h4 className="font-display font-[800] text-[32px] leading-none tracking-[-0.02em] m-0">
                Never-stale.{" "}
                <em className="font-normal">Refreshed weekly.</em>
              </h4>
              <p className="text-[13px] leading-[1.55] text-ink-70 m-0 font-mono">
                Seasonal, event-aware, inventory-aware. Google notices; so do
                your regulars.
              </p>
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
          <div className="mb-20 max-[820px]:mb-14">
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
                  "Your voice, every page",
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
