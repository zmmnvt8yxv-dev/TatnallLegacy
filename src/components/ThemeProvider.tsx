import type { PropsWithChildren } from "react";
import { themeTokens } from "../styles/theme";

const cssVars = {
  "--color-bg": themeTokens.colors.background,
  "--color-surface": themeTokens.colors.surface,
  "--color-surface-alt": themeTokens.colors.surfaceAlt,
  "--color-border": themeTokens.colors.border,
  "--color-muted": themeTokens.colors.muted,
  "--color-foreground": themeTokens.colors.foreground,
  "--color-accent": themeTokens.colors.accent,
  "--color-accent-strong": themeTokens.colors.accentStrong,
  "--color-positive": themeTokens.colors.positive,
  "--color-warning": themeTokens.colors.warning,
  "--color-danger": themeTokens.colors.danger,
  "--space-xs": themeTokens.spacing.xs,
  "--space-sm": themeTokens.spacing.sm,
  "--space-md": themeTokens.spacing.md,
  "--space-lg": themeTokens.spacing.lg,
  "--space-xl": themeTokens.spacing.xl,
  "--space-2xl": themeTokens.spacing["2xl"],
  "--font-base": themeTokens.typography.fontFamily,
  "--font-size-base": themeTokens.typography.fontSizeBase,
  "--line-height-base": themeTokens.typography.lineHeightBase,
  "--shadow-sm": themeTokens.elevation.sm,
  "--shadow-md": themeTokens.elevation.md,
  "--shadow-lg": themeTokens.elevation.lg
} as const;

export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <div style={cssVars} className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
