"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { ArrowIcon } from "@/components/shared/Icons";
import { PulpMark, PulpDrop } from "@/components/shared/PulpLogo";

export default function SignInPage() {
  const router = useRouter();
  const { login, loading, error } = useAuth();
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await login(password);
    // If login succeeded, token is now in localStorage
    if (localStorage.getItem("pulp_token")) {
      router.push("/generate");
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-[1fr_1fr] max-[900px]:grid-cols-1">
      {/* ====== LEFT COLUMN ====== */}
      <div className="flex flex-col justify-between p-10 max-[720px]:p-6 bg-white min-h-screen max-[900px]:min-h-0">
        {/* Brand lockup */}
        <a href="/" className="flex items-center gap-3">
          <PulpMark size={36} />
          <span className="font-display font-[800] text-2xl tracking-[-0.03em] leading-none inline-flex items-end">
            Pulp<span className="inline-block w-[0.22em] h-[0.32em] ml-[0.08em] mb-[0.04em]"><PulpDrop size="100%" /></span>
          </span>
        </a>

        {/* Centered form area */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-[380px]">
            {/* Eyebrow */}
            <div className="flex items-center gap-2.5 text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-6">
              <span className="w-2 h-2 rounded-full bg-ink inline-block" />
              Welcome back
            </div>

            {/* Headline */}
            <h1 className="font-display font-[800] text-[54px] max-[720px]:text-[40px] leading-[0.92] tracking-[-0.035em] mb-5">
              Fresh-squeezed,
              <br />
              <span className="font-display font-normal tracking-[-0.015em] text-pulp-deep">
                freshly signed in.
              </span>
            </h1>

            {/* Lede */}
            <p className="text-[14px] leading-[1.55] text-ink-70 max-w-[38ch] mb-9 font-mono">
              One account runs every location&apos;s copy. Pick up where you left
              off.
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                className="w-full h-[46px] px-5 rounded-full border-[1.5px] border-ink bg-white font-mono text-[13px] text-ink placeholder:text-ink-40 outline-none transition-shadow focus:shadow-[4px_4px_0_0_var(--ink)]"
              />
              <button
                type="submit"
                disabled={loading || !password}
                className="group w-full h-[46px] rounded-full bg-ink text-white font-medium text-xs tracking-[0.04em] inline-flex items-center justify-center gap-2 border-[1.5px] border-ink transition-all hover:-translate-y-px hover:bg-pulp hover:text-ink hover:border-pulp disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Signing in..." : "Sign in"}
                {!loading && (
                  <ArrowIcon className="transition-transform group-hover:translate-x-[3px]" />
                )}
              </button>

              {/* Error message */}
              {error && (
                <p className="text-[13px] text-red-600 text-center font-mono m-0">
                  {error}
                </p>
              )}
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between text-[10px] tracking-[0.2em] uppercase text-ink-40">
          <span>Pulp Copy, Inc.</span>
          <span>Cold-pressed. Oakland</span>
        </div>
      </div>

      {/* ====== RIGHT COLUMN ====== */}
      <div className="relative flex flex-col justify-center p-10 max-[720px]:p-6 bg-ink text-white overflow-hidden max-[900px]:min-h-[50vh]">
        {/* Decorative star */}
        <div
          className="absolute right-[-60px] bottom-[-40px] text-[280px] font-display leading-none select-none pointer-events-none"
          style={{ color: "#1f1c19" }}
        >
          &#10033;
        </div>

        <div className="relative z-[2] max-w-[480px]">
          {/* Customer tag */}
          <div className="flex items-center gap-2.5 text-[10px] tracking-[0.22em] uppercase text-white/65 mb-10">
            <span className="w-2 h-2 rounded-full bg-white inline-block" />
            Customer. Halfmoon Hotels
          </div>

          {/* Blockquote */}
          <blockquote className="font-display font-normal text-[44px] max-[720px]:text-[32px] leading-[1.05] tracking-[-0.025em] m-0 mb-12">
            We shipped <span className="font-[800]">412 location pages</span> in
            a weekend. Google traffic{" "}
            <em className="font-display font-normal text-pulp-deep">tripled</em> in six weeks.
          </blockquote>

          {/* Attribution */}
          <div className="flex gap-3.5 items-center">
            <div className="w-10 h-10 rounded-full bg-white text-ink flex items-center justify-center font-display font-[800] text-lg flex-none">
              M
            </div>
            <div>
              <div className="font-display font-[800] text-base tracking-[-0.01em] text-white leading-none mb-1">
                Maya Ortiz
              </div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-white/65">
                Head of Growth. 89 properties
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
