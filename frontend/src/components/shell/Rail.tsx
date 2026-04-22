"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { SliceMark } from "@/components/shared/Icons";
import { UserChip } from "@/components/shell/UserChip";

interface RailProps {
  onSignOut: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  disabled?: boolean;
  count?: number;
}

function GenerateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h8M8 4v8" />
      <rect x="2" y="2" width="12" height="12" rx="3" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 2" />
    </svg>
  );
}

function VoiceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6s2-2 6-2 6 2 6 2" />
      <path d="M2 10s2 2 6 2 6-2 6-2" />
      <path d="M8 4v8" />
    </svg>
  );
}

function OverviewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function LocationsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1C5.5 1 4 3 4 5.5 4 9 8 15 8 15s4-6 4-9.5C12 3 10.5 1 8 1z" />
      <circle cx="8" cy="5.5" r="1.5" />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h10M3 8h10M3 12h6" />
    </svg>
  );
}

function IntegrationsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2v4a2 2 0 0 1-2 2H2" />
      <path d="M10 2v4a2 2 0 0 0 2 2h2" />
      <path d="M6 14v-4a2 2 0 0 0-2-2H2" />
      <path d="M10 14v-4a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
    </svg>
  );
}

const navItems: NavItem[] = [
  { label: "Overview", href: "/overview", icon: <OverviewIcon /> },
  { label: "Generate", href: "/generate", icon: <GenerateIcon /> },
  { label: "History", href: "/history", icon: <HistoryIcon /> },
  { label: "Voice", href: "/voice", icon: <VoiceIcon /> },
  { label: "Locations", href: "/locations", icon: <LocationsIcon /> },
  { label: "Copy queue", href: "/queue", icon: <QueueIcon />, disabled: true },
  { label: "Integrations", href: "/integrations", icon: <IntegrationsIcon />, disabled: true },
  { label: "Settings", href: "/settings", icon: <SettingsIcon />, disabled: true },
];

export function Rail({ onSignOut }: RailProps) {
  const pathname = usePathname();

  return (
    <aside className="w-[240px] h-screen sticky top-0 flex flex-col border-r-[1.5px] border-line bg-white max-[900px]:w-full max-[900px]:h-auto max-[900px]:static max-[900px]:border-r-0 max-[900px]:border-b-[1.5px]">
      {/* Brand lockup */}
      <a href="/" className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <SliceMark className="w-7 h-7 text-pulp overflow-visible" />
        <span className="font-display font-[800] text-[22px] tracking-[-0.03em] leading-none">
          Pulp
        </span>
      </a>

      {/* Nav section */}
      <nav className="flex-1 px-3 flex flex-col max-[900px]:flex-row max-[900px]:flex-wrap max-[900px]:gap-1 max-[900px]:pb-3">
        <div className="text-[9px] tracking-[0.22em] uppercase text-ink-40 px-2 mb-2 max-[900px]:hidden">
          Workspace
        </div>

        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          if (item.disabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-[10px] text-ink-40 cursor-default select-none"
              >
                <span className="flex-none">{item.icon}</span>
                <span className="text-[13px]">{item.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-[10px] transition-colors duration-150 ${
                isActive
                  ? "bg-ink text-white border border-ink"
                  : "text-ink hover:bg-line-soft hover:text-ink border border-transparent"
              }`}
            >
              <span className="flex-none">{item.icon}</span>
              <span className="text-[13px]">{item.label}</span>
              {item.count !== undefined && (
                <span
                  className={`ml-auto text-[10px] px-1.5 py-px rounded-full border-[1.5px] ${
                    isActive
                      ? "bg-white text-ink border-white"
                      : "bg-white text-ink border-ink"
                  }`}
                >
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User chip at bottom */}
      <div className="mt-auto px-3 pb-4 max-[900px]:hidden">
        <UserChip onSignOut={onSignOut} />
      </div>
    </aside>
  );
}
