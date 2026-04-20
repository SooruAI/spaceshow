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
    },
  },
  plugins: [],
};
