"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { ArrowIcon } from "@/components/shared/Icons";
import { BrandLockup } from "@/components/shared/BrandLockup";

export default function SignInPage() {
  const router = useRouter();
  const { login, loading, error } = useAuth();
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await login(password);
    if (localStorage.getItem("pulp_token")) {
      router.push("/generate");
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--app-bg)" }}
    >
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center mb-8">
          <BrandLockup size={32} />
        </div>

        <div className="bg-white border border-line rounded-pop-lg shadow-card p-7">
          <h1 className="font-display font-bold text-[20px] tracking-[-0.01em] text-ink mb-1">
            Sign in
          </h1>
          <p className="text-[13px] text-ink-40 mb-6">
            Threshold Marketing Services content platform.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full h-11 px-4 rounded-lg border border-line bg-white text-[13px] text-ink placeholder:text-ink-40 outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10"
            />
            <button
              type="submit"
              disabled={loading || !password}
              className="group w-full h-11 rounded-lg bg-ink text-white font-semibold text-sm inline-flex items-center justify-center gap-2 border border-ink transition-all hover:bg-[#1f2940] hover:shadow-card-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign in"}
              {!loading && (
                <ArrowIcon className="transition-transform group-hover:translate-x-[3px]" />
              )}
            </button>

            {error && (
              <p className="text-[13px] text-red-600 text-center m-0">{error}</p>
            )}
          </form>
        </div>

        <p className="text-center text-[10px] tracking-[0.2em] uppercase text-ink-40 mt-6">
          Threshold Marketing Services
        </p>
      </div>
    </div>
  );
}
