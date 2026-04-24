/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["class", "[data-theme='dark']"],
  theme: {
    extend: {
      colors: {
        // Map our existing semantic names to CSS vars so light/dark theming
        // is purely a data-attribute swap. SpaceDM palette below.
        ink: {
          50:  "var(--bg-primary)",     // page bg (used rarely)
          100: "var(--text-primary)",   // primary text
          200: "var(--text-primary)",
          300: "var(--text-secondary)", // secondary text
          400: "var(--text-muted)",
          500: "var(--text-muted)",
          600: "var(--bg-hover)",       // hover surfaces
          700: "var(--bg-tertiary)",    // borders / nested surfaces
          800: "var(--bg-secondary)",   // panels
          900: "var(--bg-primary)",     // app background
        },
        brand: {
          500: "var(--accent-hover)",
          600: "var(--accent)",
          700: "var(--accent-strong)",
        },
        edge: "var(--border)",
        "edge-subtle": "var(--border-subtle)",
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      fontFamily: {
        sans: ["Outfit", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        heading: ["Syne", "Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["11px", "16px"],
        sm: ["12px", "16px"],
        base: ["13px", "18px"],
        md: ["13px", "18px"],
        lg: ["15px", "20px"],
        xl: ["18px", "24px"],
      },
      boxShadow: {
        panel: "0 2px 8px rgba(0,0,0,0.10)",
        pop: "0 12px 40px rgba(0,0,0,0.25)",
      },
      transitionDuration: {
        DEFAULT: "120ms",
      },
      keyframes: {
        // Used by SpacePresent sheet-selection modal on mount.
        "fade-scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        // Generic fade-in (end-of-present overlay, presenter enter/exit).
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // Used when user presses Prev on the first slide — quick horizontal
        // wobble to indicate "can't go back further".
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-8px)" },
          "40%, 80%": { transform: "translateX(8px)" },
        },
      },
      animation: {
        "fade-scale-in": "fade-scale-in 180ms ease-out",
        "fade-in": "fade-in 200ms ease-out",
        shake: "shake 320ms ease-in-out",
      },
    },
  },
  plugins: [],
};
