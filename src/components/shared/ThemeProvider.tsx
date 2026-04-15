"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  PREFERS_DARK_MEDIA_QUERY,
  resolveTheme,
  sanitizeThemePreference,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

interface ThemeContextValue {
  isMounted: boolean;
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ResolvedTheme) => void;
  toggleTheme: () => void;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDocument(theme: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function getSystemPreference(): boolean {
  return window.matchMedia(PREFERS_DARK_MEDIA_QUERY).matches;
}

function getStoredPreference(): ThemePreference | null {
  return sanitizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(PREFERS_DARK_MEDIA_QUERY);
    setPreference(getStoredPreference() ?? "system");
    setSystemPrefersDark(mediaQuery.matches);
    setIsMounted(true);

    const updatePreference = (matches: boolean) => {
      setSystemPrefersDark(matches);
    };

    updatePreference(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      updatePreference(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const resolvedTheme = useMemo(
    () => resolveTheme(preference, systemPrefersDark),
    [preference, systemPrefersDark]
  );

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    applyThemeToDocument(resolvedTheme);

    if (preference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  }, [isMounted, preference, resolvedTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      isMounted,
      preference,
      resolvedTheme,
      setTheme: (theme: ResolvedTheme) => {
        setPreference(theme);
      },
      toggleTheme: () => {
        setPreference(resolvedTheme === "dark" ? "light" : "dark");
      },
      setPreference,
    }),
    [isMounted, preference, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}