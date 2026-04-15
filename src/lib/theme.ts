export const THEME_STORAGE_KEY = "mployedin-theme";
export const PREFERS_DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function sanitizeThemePreference(value: string | null | undefined): ThemePreference | null {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  return null;
}

export function resolveTheme(
  preference: ThemePreference | null | undefined,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === "light" || preference === "dark") {
    return preference;
  }

  return systemPrefersDark ? "dark" : "light";
}

export function getThemeInitializationScript(): string {
  return `(() => {
    const storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
    const mediaQuery = ${JSON.stringify(PREFERS_DARK_MEDIA_QUERY)};
    const root = document.documentElement;
    const applyTheme = (theme) => {
      root.classList.toggle("dark", theme === "dark");
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
    };

    try {
      const stored = window.localStorage.getItem(storageKey);
      const preference = stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : null;
      const prefersDark = window.matchMedia(mediaQuery).matches;
      applyTheme(preference === "dark" || preference === "light"
        ? preference
        : prefersDark ? "dark" : "light");
    } catch {
      applyTheme(window.matchMedia(mediaQuery).matches ? "dark" : "light");
    }
  })();`;
}