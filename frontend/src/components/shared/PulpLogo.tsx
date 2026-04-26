import * as React from "react";

/**
 * Pulp brand assets.
 *
 * Tokens (use these in your theme):
 *   --pulp:       #F26430   — squeezed-orange, brand primary
 *   --pulp-deep:  #C84A1F   — for hovers / small type contrast
 *   --cream:      #F7EDD8   — warm cream, paper background
 *   --ink:        #141210   — body type / outlines
 *
 * Wordmark is set in Fraunces 800 (Google Fonts). Make sure it's loaded:
 *   <link rel="preconnect" href="https://fonts.googleapis.com" />
 *   <link rel="stylesheet"
 *         href="https://fonts.googleapis.com/css2?family=Fraunces:wght@800&display=swap" />
 */

type CommonProps = { size?: number | string; className?: string; title?: string };

/** Cross-section disc mark. Color-fixed (orange/cream/ink). */
export function PulpMark({ size = 36, className, title = "Pulp" }: CommonProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      <circle cx="100" cy="100" r="90" fill="#F26430" />
      <g stroke="#F7EDD8" strokeWidth="8" strokeLinecap="butt" fill="none">
        <line x1="100" y1="100" x2="190" y2="100" />
        <line x1="100" y1="100" x2="163.6" y2="163.6" />
        <line x1="100" y1="100" x2="100" y2="190" />
        <line x1="100" y1="100" x2="36.4" y2="163.6" />
        <line x1="100" y1="100" x2="10" y2="100" />
        <line x1="100" y1="100" x2="36.4" y2="36.4" />
        <line x1="100" y1="100" x2="100" y2="10" />
        <line x1="100" y1="100" x2="163.6" y2="36.4" />
      </g>
      <circle cx="100" cy="100" r="16" fill="#F7EDD8" />
      <circle cx="100" cy="100" r="9" fill="#141210" />
      <circle cx="100" cy="100" r="90" fill="none" stroke="#141210" strokeWidth="9" />
    </svg>
  );
}

/** Drop "period" — replaces the dot in the wordmark. Color-fixed. */
export function PulpDrop({ size = 12, className }: { size?: number | string; className?: string }) {
  return (
    <svg
      viewBox="0 3 40 46"
      width={size}
      aria-hidden="true"
      className={className}
      style={{ display: "inline-block", flex: "none" }}
    >
      <path
        d="M20 6 C 8 22, 4 34, 4 42 A 16 16 0 0 0 36 42 C 36 34, 32 22, 20 6 Z"
        fill="#F26430"
        stroke="#141210"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full lockup: mark + "Pulp" wordmark + drop period.
 * Pass a `size` (the mark's pixel size); the wordmark scales relative to it.
 */
export function PulpLockup({
  size = 36,
  className,
  inkColor = "#141210",
}: CommonProps & { inkColor?: string }) {
  const fontPx = typeof size === "number" ? size * 0.66 : "1.5em";
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: inkColor,
        lineHeight: 1,
      }}
    >
      <PulpMark size={size} />
      <span
        style={{
          fontFamily: 'Fraunces, "Times New Roman", serif',
          fontWeight: 800,
          fontSize: fontPx,
          letterSpacing: "-0.03em",
          display: "inline-flex",
          alignItems: "flex-end",
          lineHeight: 1,
        }}
      >
        Pulp
        <PulpDrop size="0.15em" />
      </span>
    </span>
  );
}
