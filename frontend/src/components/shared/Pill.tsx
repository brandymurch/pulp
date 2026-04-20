"use client";

interface PillProps {
  variant?: "default" | "live" | "draft" | "stale" | "count";
  children: React.ReactNode;
  className?: string;
}

export function Pill({ variant = "default", children, className = "" }: PillProps) {
  const base = "inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] uppercase px-2.5 py-0.5 rounded-full border-[1.5px] border-ink";
  const variants = {
    default: "bg-white text-ink",
    live: "bg-ink text-white",
    draft: "bg-white text-ink",
    stale: "bg-white text-ink-70",
    count: "bg-white text-ink text-[10px] px-2 py-px",
  };
  const dotColors: Record<string, string> = {
    live: "bg-[#7FE295]",
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
