"use client";

import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactElement } from "react";

/**
 * Creates a fresh QueryClient for each test to prevent state leakage.
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Test wrapper that provides QueryClientProvider (same as DashboardProviders
 * but without Toaster and with test-friendly QueryClient defaults).
 */
function TestProviders({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

/**
 * Custom render that wraps components in test providers.
 * Use instead of `render()` from @testing-library/react.
 *
 * @example
 * import { renderWithProviders, screen } from "@/test-utils";
 * renderWithProviders(<MyComponent />);
 * expect(screen.getByText("Hello")).toBeInTheDocument();
 */
function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: TestProviders, ...options });
}

// Re-export everything from testing-library
export * from "@testing-library/react";
export { renderWithProviders, createTestQueryClient };
