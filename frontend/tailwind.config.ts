import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // LocalEdge palette (navy + gold). Token names are preserved so the
        // existing ~750 class references repoint to the new look automatically.
        pulp: "#F5B731", // brand / accent (gold)
        "pulp-deep": "#D99C2B", // deeper gold for hover / contrast
        cream: "#F8F4E8", // warm beige surface
        ink: "#141B2D", // primary navy: dark text, dark surfaces
        "ink-70": "#475569", // secondary text (slate-600)
        "ink-40": "#94A3B8", // tertiary text (slate-400)
        line: "#E5E7EB", // borders, dividers
        "line-soft": "#F1F5F9", // light surface, hover (slate-100)
        paper: "#FFFFFF",
        green: "#047857", // success (emerald-700)
        amber: "#B45309", // warning (amber-700)
      },
      fontFamily: {
        display: ["var(--font-display)", "Space Grotesk", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        pop: "12px",
        "pop-lg": "14px",
        "pop-xl": "16px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(20, 27, 45, 0.06)",
        "card-md": "0 4px 14px -4px rgba(20, 27, 45, 0.12)",
        "card-lg": "0 16px 40px -16px rgba(20, 27, 45, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
