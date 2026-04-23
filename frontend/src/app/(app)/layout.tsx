"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Rail } from "@/components/shell/Rail";
import { Topbar } from "@/components/shell/Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) router.replace("/sign-in");
  }, [mounted, isAuthenticated, router]);

  if (!mounted || !isAuthenticated) return null;

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] max-[900px]:grid-cols-1">
      <Rail onSignOut={logout} />
      <main className="min-w-0" style={{ padding: "32px 44px 80px" }}>
        <Topbar />
        {children}
      </main>
    </div>
  );
}
