"use client";

interface UserChipProps {
  onSignOut: () => void;
  email?: string;
}

export function UserChip({ onSignOut, email = "user@pulp.copy" }: UserChipProps) {
  const name = "Pulp User";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2.5 border-[1.5px] border-ink rounded-[14px] px-[10px] py-[8px]">
      {/* Avatar */}
      <div className="w-[30px] h-[30px] rounded-full bg-ink flex items-center justify-center flex-none">
        <span className="font-display font-[800] text-[13px] text-white leading-none">
          {initial}
        </span>
      </div>

      {/* Meta */}
      <div className="flex flex-col min-w-0">
        <span className="font-display font-[800] text-[14px] leading-tight tracking-[-0.01em] truncate">
          {name}
        </span>
        <span className="text-[10px] text-ink-70 leading-tight truncate">
          {email}
        </span>
      </div>

      {/* Sign-out button */}
      <button
        onClick={onSignOut}
        className="ml-auto flex-none w-[22px] h-[22px] flex items-center justify-center text-ink-40 hover:text-ink transition-colors cursor-pointer bg-transparent border-none p-0"
        aria-label="Sign out"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
          <path d="M10 12l4-4-4-4" />
          <path d="M14 8H6" />
        </svg>
      </button>
    </div>
  );
}
