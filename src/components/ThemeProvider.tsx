import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { lightThemeTokens, themeTokens } from "../styles/theme";

type ThemeMode = "dark" | "light";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => undefined,
  toggleTheme: () => undefined,
});

const storageKey = "tatnall-theme";

function buildCssVars(tokens: typeof themeTokens) {
  return {
    "--color-bg": tokens.colors.background,
    "--color-surface": tokens.colors.surface,
    "--color-surface-alt": tokens.colors.surfaceAlt,
    "--color-border": tokens.colors.border,
    "--color-muted": tokens.colors.muted,
    "--color-foreground": tokens.colors.foreground,
    "--color-accent": tokens.colors.accent,
    "--color-accent-strong": tokens.colors.accentStrong,
    "--color-positive": tokens.colors.positive,
    "--color-warning": tokens.colors.warning,
    "--color-danger": tokens.colors.danger,
    "--space-xs": tokens.spacing.xs,
    "--space-sm": tokens.spacing.sm,
    "--space-md": tokens.spacing.md,
    "--space-lg": tokens.spacing.lg,
    "--space-xl": tokens.spacing.xl,
    "--space-2xl": tokens.spacing["2xl"],
    "--font-base": tokens.typography.fontFamily,
    "--font-size-base": tokens.typography.fontSizeBase,
    "--line-height-base": tokens.typography.lineHeightBase,
    "--shadow-sm": tokens.elevation.sm,
    "--shadow-md": tokens.elevation.md,
    "--shadow-lg": tokens.elevation.lg,
  } as const;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" ? stored : "dark";
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const cssVars = useMemo(() => {
    return buildCssVars(theme === "dark" ? themeTokens : lightThemeTokens);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <div style={cssVars} data-theme={theme} className="min-h-screen bg-background text-foreground">
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
