module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-alt": "var(--color-surface-alt)",
        border: "var(--color-border)",
        muted: "var(--color-muted)",
        foreground: "var(--color-foreground)",
        accent: "var(--color-accent)",
        "accent-strong": "var(--color-accent-strong)",
        positive: "var(--color-positive)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)"
      },
      boxShadow: {
        soft: "var(--shadow-sm)",
        "soft-md": "var(--shadow-md)",
        "soft-lg": "var(--shadow-lg)"
      },
      fontFamily: {
        sans: ["var(--font-base)"]
      }
    }
  },
  plugins: []
};
