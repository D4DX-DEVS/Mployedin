/**
 * @jest-environment jsdom
 *
 * urlQuery remembers the query string a list page last asked for, so two
 * writers in the same tick don't drop each other's params. That memory
 * outlived real navigation: every list resets to page 1 on mount — a write
 * that leaves the URL exactly as it is — and the remembered "" then hid the
 * next link click. Live on the deployed build (2026-10-12): Agent → Job
 * seekers → "In my area" changed the address to ?view=area but the list stayed
 * on "All my job seekers"; "Referred by me" and "All" were dead the same way.
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";

const replace = jest.fn();
let mockSearch = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () => mockSearch,
}));

import { readQuery, writeQuery } from "@/lib/ui/urlQuery";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { usePagination } from "@/hooks/usePagination";

let testNo = 0;
let base = "";
beforeEach(() => {
  replace.mockClear();
  base = `/en/agent/job-seekers-${++testNo}`;
  window.history.replaceState(null, "", base);
  mockSearch = new URLSearchParams();
});

/** A link click: the browser moves to a new query string we did not write. */
const navigate = (search: string) => window.history.pushState(null, "", `${base}${search}`);

describe("readQuery / writeQuery", () => {
  it("a write that leaves the URL as it is doesn't hide a later link click", () => {
    writeQuery(new URLSearchParams(), replace);
    navigate("?view=area");

    expect(readQuery().get("view")).toBe("area");
  });

  it("a write the browser hasn't applied yet is dropped once someone navigates elsewhere", () => {
    writeQuery(new URLSearchParams("search=driver"), replace);
    navigate("?view=area");

    expect(readQuery().toString()).toBe("view=area");
  });

  it("two writes in the same tick still see each other", () => {
    writeQuery(new URLSearchParams("status=pending"), replace);

    const params = readQuery();
    params.set("page", "2");
    writeQuery(params, replace);

    expect(replace).toHaveBeenLastCalledWith("?status=pending&page=2");
  });

  it("once the browser catches up, the browser is the truth", () => {
    writeQuery(new URLSearchParams("status=pending"), replace);
    window.history.replaceState(null, "", `${base}?status=pending`);
    expect(readQuery().toString()).toBe("status=pending");

    navigate("?status=accepted");
    expect(readQuery().toString()).toBe("status=accepted");
  });
});

describe("the job seekers page's view tabs", () => {
  it("follow a tab link after the list reset its page on mount", () => {
    const { result, rerender } = renderHook(() => {
      const pagination = usePagination();
      const [view] = useUrlFilter("view", "all", { allow: ["all", "area", "referred"] });
      React.useEffect(() => { pagination.resetPage(); }, [view]);  
      return view;
    });
    expect(result.current).toBe("all");

    act(() => {
      navigate("?view=area");
      mockSearch = new URLSearchParams("view=area");
    });
    rerender();

    expect(result.current).toBe("area");
  });
});
