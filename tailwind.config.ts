import type { Config } from "tailwindcss";

/**
 * Farben und Typografie nach DRK-Styleguide (styleguide.drk.de → Basiselemente/Farben, Digital/Webseite).
 * Rot: Buttons, Überschriften, Icons · Dunkelrot: Hover · Dunkelblau: Menü, Pfeile, Buttons, Hover
 * Mittelblau: Hover/Links · Volltonblau: Links im Fließtext · Hellblau: Formular-Hintergründe
 * Dunkelgrau: Fließtext · Mittelgrau: Trennlinien · Hellgrau: strukturierende Hintergrundfläche
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    borderRadius: {
      none: "0",
      sm: "2px",
      DEFAULT: "2px",
      md: "3px",
      lg: "3px",
      xl: "4px",
      "2xl": "6px",
      full: "9999px",
    },
    extend: {
      colors: {
        drk: {
          50: "#fdf2ef",
          100: "#fde3dc",
          200: "#fac3af", // DRK-Rot 30 %
          300: "#eb8264", // DRK-Rot 60 %
          400: "#e46450", // Softrot (Icons)
          500: "#e60005", // DRK-Rot
          600: "#a51e0f", // Dunkelrot (Hover)
          700: "#a51e0f",
          800: "#86180c",
        },
        drkblue: {
          50: "#ebf5ff", // Hellblau (Formulare, Infoflächen, Menü-Hover)
          100: "#dbe6f2",
          300: "#b4c3d7", // Blau 30 %
          500: "#698caf", // Blau 60 %
          600: "#008ccd", // Mittelblau (Hover, Links)
          700: "#2275d0", // Volltonblau (Links im Fließtext)
          900: "#002d55", // Dunkelblau
        },
        // Neutrale Töne auf DRK-Graustufen abgebildet
        gray: {
          50: "#f7f6f3",
          100: "#efeeea", // Hellgrau
          200: "#e3e1dc",
          300: "#b4b4b4", // Mittelgrau (Trennlinien)
          400: "#9a958f",
          500: "#7f7f7f", // Grau 50 %
          600: "#68625c",
          700: "#554f4a", // Dunkelgrau (Fließtext)
          800: "#3e3935",
          900: "#2a2623",
        },
      },
      fontFamily: {
        // Hausschrift Helvetica Neue (lizenzpflichtig, auf Apple-Geräten vorhanden), Ersatz laut Styleguide: Open Sans, Arial, Helvetica
        sans: ['"Helvetica Neue"', '"Open Sans"', "Arial", "Helvetica", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
