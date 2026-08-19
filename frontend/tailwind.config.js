/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0D1117",
          secondary: "#161B22",
          card: "#21262D",
        },
        border: {
          subtle: "#30363D",
          active: "#58A6FF",
        },
        accent: {
          volt: "#D4FF00",
          orange: "#FF5722",
          coffee: "#E67E22",
        },
        text: {
          primary: "#F0F6FC",
          secondary: "#8B949E",
          muted: "#6E7681",
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
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
