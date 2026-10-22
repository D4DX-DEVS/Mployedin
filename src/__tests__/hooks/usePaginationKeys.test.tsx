/**
 * @jest-environment jsdom
 */
/**
 * usePagination's URL keys: by default ?page= and ?limit=, as every list
 * already uses. A second list on the same page (Admin > GDPR's consent tables
 * under Data Requests) passes its own keys so the two never share a page.
 */
import { act, renderHook } from "@testing-library/react";
import { usePagination } from "@/hooks/usePagination";

const replaceMock = jest.fn((href: string) => window.history.replaceState(null, "", href));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => "/en/admin/gdpr",
}));

const params = () => Object.fromEntries(new URLSearchParams(window.location.search));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("usePagination URL keys", () => {
  it("reads and writes ?page and ?limit by default", () => {
    window.history.replaceState(null, "", "/en/admin/gdpr?page=3&limit=50");
    const { result } = renderHook(() => usePagination());

    expect(result.current.page).toBe(3);
    expect(result.current.limit).toBe(50);
    act(() => result.current.setPage(4));
    expect(params()).toEqual({ page: "4", limit: "50" });
  });

  it("uses its own keys when given them, and leaves the default ones alone", () => {
    window.history.replaceState(null, "", "/en/admin/gdpr?page=3&limit=50&choicesPage=2&choicesLimit=25");
    const { result } = renderHook(() => usePagination(10, { pageKey: "choicesPage", limitKey: "choicesLimit" }));

    expect(result.current.page).toBe(2);
    expect(result.current.limit).toBe(25);

    act(() => result.current.setPage(5));
    expect(params()).toEqual({ page: "3", limit: "50", choicesPage: "5", choicesLimit: "25" });

    act(() => result.current.setLimit(100));
    expect(params()).toEqual({ page: "3", limit: "50", choicesLimit: "100" });

    act(() => result.current.resetPage());
    expect(params()).toEqual({ page: "3", limit: "50", choicesLimit: "100" });
  });

  it("drops its keys at their defaults, like the default ones", () => {
    window.history.replaceState(null, "", "/en/admin/gdpr?otherPage=2&otherLimit=25");
    const { result } = renderHook(() => usePagination(10, { pageKey: "otherPage", limitKey: "otherLimit" }));

    act(() => result.current.setLimit(10));
    expect(params()).toEqual({});
  });
});
