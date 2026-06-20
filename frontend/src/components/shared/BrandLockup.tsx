import * as React from "react";

/**
 * TMSContentAI brand lockup — gold-gradient square + wordmark with a gold "AI".
 * `onDark` = placed on a dark surface (navy nav bar) → white wordmark.
 */
export function BrandLockup({
  size = 28,
  onDark = false,
  className,
}: {
  size?: number;
  onDark?: boolean;
  className?: string;
}) {
  const textColor = onDark ? "#FFFFFF" : "#141B2D";
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: size * 0.32, lineHeight: 1 }}
    >
      <span
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.3,
          background: "linear-gradient(140deg, #F5C451, #E0A93B)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 700,
          fontSize: size * 0.5,
          color: "#141B2D",
          flex: "none",
        }}
      >
        T
      </span>
      <span
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 700,
          fontSize: size * 0.56,
          letterSpacing: "-0.02em",
          color: textColor,
        }}
      >
        TMSContent<span style={{ color: "#F5B731" }}>AI</span>
      </span>
    </span>
  );
}
