import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        pulp: "#FFB020",
        "pulp-deep": "#E89000",
        cream: "#FBF3E6",
        ink: "#141210",
        "ink-70": "#4A4642",
        "ink-40": "#9A958E",
        line: "#E8E5E0",
        paper: "#FFFFFF",
      },
      fontFamily: {
        display: [
          "var(--font-fraunces)",
          "var(--font-instrument)",
          "Georgia",
          "serif",
        ],
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
