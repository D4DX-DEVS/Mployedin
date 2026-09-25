/**
 * @jest-environment jsdom
 *
 * useUrlFilters wrote the URL (router.replace) from inside a setState updater.
 * React runs updaters while rendering, so the router updated during another
 * component's render ("Cannot update a component while rendering a different
 * component" on /agent/offers) and StrictMode's double-invoked updater wrote the
 * URL twice per click (audit 2026-09-24 re-audit).
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";

const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { useUrlFilters } from "@/hooks/useUrlFilter";

const StrictWrapper = ({ children }: { children: React.ReactNode }) => <React.StrictMode>{children}</React.StrictMode>;

// urlQuery remembers the last write per pathname until the browser catches up,
// and the mocked router never does — a fresh path per test starts clean.
let testNo = 0;
beforeEach(() => {
  replace.mockClear();
  window.history.replaceState(null, "", `/en/agent/offers-${++testNo}`);
});

it("writes the URL once per change, outside the state updater", () => {
  const { result } = renderHook(() => useUrlFilters({ status: "all", q: "" }), { wrapper: StrictWrapper });

  act(() => result.current.setFilter("status", "pending"));

  expect(result.current.filters.status).toBe("pending");
  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith("?status=pending", { scroll: false });
});

it("keeps both keys when two filters change in the same tick", () => {
  const { result } = renderHook(() => useUrlFilters({ status: "all", source: "all" }), { wrapper: StrictWrapper });

  act(() => {
    result.current.setFilter("status", "pending");
    result.current.setFilter("source", "referral");
  });

  expect(result.current.filters).toEqual({ status: "pending", source: "referral" });
  expect(replace).toHaveBeenLastCalledWith("?status=pending&source=referral", { scroll: false });
});

it("reset returns every key to its default and clears the URL", () => {
  const { result } = renderHook(() => useUrlFilters({ status: "all" }), { wrapper: StrictWrapper });

  act(() => result.current.setFilter("status", "pending"));
  act(() => result.current.resetFilters());

  expect(result.current.filters).toEqual({ status: "all" });
  act(() => result.current.setFilter("status", "accepted"));
  expect(replace).toHaveBeenLastCalledWith("?status=accepted", { scroll: false });
});
