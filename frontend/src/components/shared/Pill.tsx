"use client";

interface PillProps {
  variant?: "default" | "live" | "draft" | "stale" | "count";
  children: React.ReactNode;
  className?: string;
}

export function Pill({ variant = "default", children, className = "" }: PillProps) {
  const base = "inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-full border";
  const variants = {
    default: "bg-line-soft text-ink-70 border-line",
    live: "bg-ink text-white border-ink",
    draft: "bg-amber/10 text-amber border-amber/30",
    stale: "bg-line-soft text-ink-40 border-line",
    count: "bg-line-soft text-ink-70 border-line text-[10px] px-2 py-px",
  };
  const dotColors: Record<string, string> = {
    live: "bg-pulp",
    draft: "bg-amber",
    stale: "bg-ink-40",
  };

  return (
    <span className={`${base} ${variants[variant]} ${className}`}>
      {(variant === "live" || variant === "draft" || variant === "stale") && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
}
