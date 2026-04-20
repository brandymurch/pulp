import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        pulp: "#FF6A1A",
        ink: "#141210",
        "ink-70": "#4A4642",
        "ink-40": "#9A958E",
        "ink-20": "#D7D3CD",
        line: "#E8E5E0",
        "line-soft": "#F3F1ED",
        paper: "#FFFFFF",
        green: "#1F7A3A",
        amber: "#B5730F",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        pop: "14px",
        "pop-lg": "18px",
        "pop-xl": "20px",
      },
    },
  },
  plugins: [],
};

export default config;
