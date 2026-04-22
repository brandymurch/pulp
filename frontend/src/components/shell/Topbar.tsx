"use client";

export function Topbar() {
  return (
    <div className="flex items-center gap-4 mb-8">
      {/* Search input (disabled) */}
      <div className="relative max-w-[420px] w-full">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-40"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3 3" />
        </svg>
        <input
          type="text"
          disabled
          placeholder="Search copy, locations..."
          className="w-full h-10 pl-9 pr-4 border-[1.5px] border-line rounded-full text-[12px] text-ink-40 bg-white placeholder:text-ink-40 cursor-default outline-none"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Cmd-K hint */}
      <div className="hidden sm:flex items-center gap-1 text-[11px] text-ink-40">
        <kbd className="inline-flex items-center justify-center h-5 px-1.5 rounded bg-line-soft border border-line text-[10px] font-mono">
          &#8984;
        </kbd>
        <kbd className="inline-flex items-center justify-center h-5 px-1.5 rounded bg-line-soft border border-line text-[10px] font-mono">
          K
        </kbd>
      </div>

    </div>
  );
}
