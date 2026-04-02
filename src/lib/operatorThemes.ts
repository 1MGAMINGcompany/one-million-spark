/**
 * Operator app color themes.
 * Three palettes: white-blue (default), white-red, black-gold.
 */

export interface OperatorTheme {
  key: string;
  label: string;
  primary: string;
  primaryForeground: string;
  bg: string;
  cardBg: string;
  cardBorder: string;
  surfaceBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  navBg: string;
  navBorder: string;
  inputBg: string;
  inputBorder: string;
  isDark: boolean;
}

export const OPERATOR_THEMES: Record<string, OperatorTheme> = {
  blue: {
    key: "blue",
    label: "White + Blue",
    primary: "#2563eb",
    primaryForeground: "#ffffff",
    bg: "#f8fafc",
    cardBg: "#ffffff",
    cardBorder: "#e2e8f0",
    surfaceBg: "#f1f5f9",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    textMuted: "#94a3b8",
    navBg: "#ffffff",
    navBorder: "#e2e8f0",
    inputBg: "#f1f5f9",
    inputBorder: "#cbd5e1",
    isDark: false,
  },
  red: {
    key: "red",
    label: "White + Red",
    primary: "#dc2626",
    primaryForeground: "#ffffff",
    bg: "#faf8f8",
    cardBg: "#ffffff",
    cardBorder: "#e5e0e0",
    surfaceBg: "#f5f0f0",
    textPrimary: "#1a0f0f",
    textSecondary: "#57474a",
    textMuted: "#a3949a",
    navBg: "#ffffff",
    navBorder: "#e5e0e0",
    inputBg: "#f5f0f0",
    inputBorder: "#d1c5c5",
    isDark: false,
  },
  gold: {
    key: "gold",
    label: "Black + Gold",
    primary: "#d4a017",
    primaryForeground: "#000000",
    bg: "#0a0a0a",
    cardBg: "rgba(255,255,255,0.04)",
    cardBorder: "rgba(255,255,255,0.08)",
    surfaceBg: "rgba(255,255,255,0.03)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(255,255,255,0.6)",
    textMuted: "rgba(255,255,255,0.3)",
    navBg: "rgba(10,10,10,0.9)",
    navBorder: "rgba(255,255,255,0.06)",
    inputBg: "rgba(255,255,255,0.05)",
    inputBorder: "rgba(255,255,255,0.1)",
    isDark: true,
  },
};

export function getOperatorTheme(themeKey: string | null | undefined): OperatorTheme {
  return OPERATOR_THEMES[themeKey || "blue"] || OPERATOR_THEMES.blue;
}

/** Theme options for onboarding picker */
export const THEME_OPTIONS = Object.values(OPERATOR_THEMES);
