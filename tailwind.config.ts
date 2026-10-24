import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#08080a",
        foreground: "#f4f4f5",
        surface: {
          50: "#18181b",
          100: "#121215",
          200: "#0e0e11",
          DEFAULT: "#0b0b0e",
        },
        brand: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          DEFAULT: "#8b5cf6",
        },
        champagne: {
          light: "#e9c49a",
          DEFAULT: "#d4a373",
          dark: "#b88352",
        },
        botanical: {
          light: "#34d399",
          DEFAULT: "#10b981",
          dark: "#059669",
        },
      },
      boxShadow: {
        doppelrand: "0 0 0 1px rgba(255,255,255,0.08), 0 0 0 2px rgba(255,255,255,0.02)",
        "glow-purple": "0 0 35px -5px rgba(139, 92, 246, 0.35)",
        "glow-gold": "0 0 35px -5px rgba(212, 163, 115, 0.3)",
      },
      borderRadius: {
        none: "0px",
        sm: "2px",
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "laser-scan": "laser 2s ease-in-out infinite",
      },
      keyframes: {
        laser: {
          "0%, 100%": { transform: "translateY(0%)", opacity: "0.8" },
          "50%": { transform: "translateY(100%)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
