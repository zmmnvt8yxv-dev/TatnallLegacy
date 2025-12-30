export const themeTokens = {
  colors: {
    background: "#0b1120",
    surface: "#0f172a",
    surfaceAlt: "#111827",
    border: "#1f2937",
    muted: "#94a3b8",
    foreground: "#e2e8f0",
    accent: "#38bdf8",
    accentStrong: "#0ea5e9",
    positive: "#22c55e",
    warning: "#f59e0b",
    danger: "#f97316",
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    "2xl": "3rem",
  },
  typography: {
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontSizeBase: "0.95rem",
    lineHeightBase: "1.55",
    headingWeight: 600,
  },
  elevation: {
    sm: "0 1px 2px rgba(15, 23, 42, 0.6)",
    md: "0 8px 24px rgba(15, 23, 42, 0.5)",
    lg: "0 16px 40px rgba(15, 23, 42, 0.6)",
  },
} as const;

export const lightThemeTokens = {
  ...themeTokens,
  colors: {
    background: "#f8fafc",
    surface: "#ffffff",
    surfaceAlt: "#f1f5f9",
    border: "#e2e8f0",
    muted: "#64748b",
    foreground: "#0f172a",
    accent: "#0284c7",
    accentStrong: "#0369a1",
    positive: "#16a34a",
    warning: "#d97706",
    danger: "#ea580c",
  },
  elevation: {
    sm: "0 1px 2px rgba(15, 23, 42, 0.08)",
    md: "0 8px 24px rgba(15, 23, 42, 0.12)",
    lg: "0 16px 40px rgba(15, 23, 42, 0.16)",
  },
} as const;

export type ThemeTokens = typeof themeTokens;
