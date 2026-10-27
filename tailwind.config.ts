import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        drk: {
          50: "#fef2f2",
          100: "#fde3e3",
          200: "#fbcccc",
          500: "#e60005",
          600: "#cc0004",
          700: "#a80004",
          800: "#8a0308",
        },
        anthracite: {
          700: "#3a3f44",
          800: "#2b2f33",
          900: "#1d2023",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
