import {
  THEME_STORAGE_KEY,
  resolveTheme,
  sanitizeThemePreference,
} from "@/lib/theme";

describe("theme utilities", () => {
  it("falls back to the device preference when there is no stored selection", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("prefers an explicit stored theme over the device preference", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("treats system as the device preference and rejects invalid values", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(sanitizeThemePreference("sepia")).toBeNull();
    expect(sanitizeThemePreference("dark")).toBe("dark");
    expect(THEME_STORAGE_KEY).toBeTruthy();
  });
});