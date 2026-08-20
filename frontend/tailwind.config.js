/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "media",
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "var(--glcc-bg-primary)",
          secondary: "var(--glcc-bg-secondary)",
          card: "var(--glcc-bg-card)",
        },
        border: {
          subtle: "var(--glcc-border-subtle)",
          active: "var(--glcc-border-active)",
        },
        accent: {
          volt: "#D4FF00",
          orange: "#FF5722",
          coffee: "#E67E22",
          strava: "#FC4C02",
          pink: "#EC4899",
        },
        text: {
          primary: "var(--glcc-text-primary)",
          secondary: "var(--glcc-text-secondary)",
          muted: "var(--glcc-text-muted)",
        },
        status: {
          going: "#2EA043",
          maybe: "#D29922",
          cant: "#F85149",
        },
      },
      fontFamily: {
        heading: ['"Barlow Condensed"', "Outfit", "sans-serif"],
        body: ["Inter", '"DM Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', '"Source Code Pro"', "monospace"],
      },
      boxShadow: {
        volt: "0 0 24px rgba(212, 255, 0, 0.25)",
        pink: "0 0 24px rgba(236, 72, 153, 0.35)",
        strava: "0 0 24px rgba(252, 76, 2, 0.35)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
