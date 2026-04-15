import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: (event: MediaQueryListEvent) => {
        listeners.forEach((listener) => listener(event));
        return true;
      },
    })),
  });
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("uses the device preference when there is no saved theme", async () => {
    mockMatchMedia(true);

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });

    expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeInTheDocument();
  });

  it("toggles the theme and persists the explicit user choice", async () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const toggle = await screen.findByRole("button", { name: /switch to dark mode/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});