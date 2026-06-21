"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { BrandLockup } from "@/components/shared/BrandLockup";

interface TopNavProps {
  onSignOut: () => void;
  email?: string;
}

const NAV_ITEMS = [
  { label: "Generate", href: "/generate" },
  { label: "Pages", href: "/pages" },
  { label: "FranDev", href: "/frandev" },
  { label: "Locations", href: "/locations" },
  { label: "Voice", href: "/voice" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function TopNav({ onSignOut, email = "" }: TopNavProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close menus on route change.
  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  // Close menus on Escape while one is open.
  useEffect(() => {
    if (!menuOpen && !mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, mobileOpen]);

  return (
    <header
      className="sticky top-0 z-40 text-white"
      style={{
        background:
          "radial-gradient(1200px 700px at 82% -200px, rgba(245,183,49,0.16), transparent 66%), #0E1730",
      }}
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center gap-4">
          {/* Brand */}
          <Link href="/" className="group flex-none">
            <BrandLockup size={26} onDark className="transition-transform group-hover:scale-[1.03]" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1 ml-4">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-white/[0.12] text-white"
                      : "text-gray-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          {/* User menu (desktop) */}
          <div className="hidden lg:block relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-gray-200 hover:bg-white/5 transition-colors"
            >
              <span className="w-7 h-7 rounded-full bg-pulp text-ink flex items-center justify-center font-display font-bold text-[12px]">
                {(email.trim()[0] || "U").toUpperCase()}
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-56 z-20 rounded-xl bg-[#141D33] border border-white/10 shadow-xl py-1.5">
                  <div className="px-3.5 py-2 text-[11px] text-gray-400 border-b border-white/10 truncate">
                    {email.trim() || "Signed in"}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full text-left px-3.5 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="lg:hidden p-2 rounded-lg text-gray-200 hover:bg-white/5"
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              {mobileOpen ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden pb-3 space-y-1 border-t border-white/10 pt-2">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                    active ? "bg-white/[0.12] text-white" : "text-gray-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onSignOut();
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/5 border-t border-white/10 mt-1"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
