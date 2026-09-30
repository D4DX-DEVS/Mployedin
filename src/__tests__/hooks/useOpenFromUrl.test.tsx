/**
 * @jest-environment jsdom
 *
 * Client report 2026-09-30 (#13): User Management had no way to assign an
 * agent to a super agent or an employer to an agent. Its row actions now link
 * to the page that owns each assignment with `?open=<userId>`, and that page
 * opens its own dialog for the row — one assignment path, not two.
 */
import React from "react";
import { renderHook } from "@testing-library/react";

const replace = jest.fn();
let search = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

import { useOpenFromUrl } from "@/hooks/useOpenFromUrl";
import { assignmentHref } from "@/lib/admin/assignmentLinks";

let testNo = 0;
function at(query: string) {
  search = query;
  window.history.replaceState(null, "", `/en/admin/agents-${++testNo}${query ? `?${query}` : ""}`);
}

beforeEach(() => replace.mockClear());

const rows = [{ _id: "u1", name: "One" }, { _id: "u2", name: "Two" }];

describe("useOpenFromUrl", () => {
  it("opens the row named in ?open= once, and takes the param out of the address", () => {
    at("search=two%40example.com&open=u2");
    const open = jest.fn();
    const { rerender } = renderHook(({ items }) => useOpenFromUrl(items, open), { initialProps: { items: rows } });
    rerender({ items: [...rows] });

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(rows[1]);
    expect(replace).toHaveBeenCalledWith("?search=two%40example.com", { scroll: false });
  });

  it("waits for the list: nothing opens until the row has loaded", () => {
    at("open=u2");
    const open = jest.fn();
    const { rerender } = renderHook(({ items }) => useOpenFromUrl(items, open), { initialProps: { items: [] as typeof rows } });
    expect(open).not.toHaveBeenCalled();

    rerender({ items: rows });
    expect(open).toHaveBeenCalledWith(rows[1]);
  });

  it("does nothing without the param or for a row that is not in the list", () => {
    at("");
    const open = jest.fn();
    renderHook(() => useOpenFromUrl(rows, open));
    at("open=missing");
    renderHook(() => useOpenFromUrl(rows, open));
    expect(open).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("assignmentHref", () => {
  it("sends each role to the page that owns its assignment, found by e-mail", () => {
    expect(assignmentHref({ _id: "a1", email: "a@x.com", role: "agent" }, "en"))
      .toBe("/en/admin/agents?search=a%40x.com&open=a1");
    expect(assignmentHref({ _id: "s1", email: "s@x.com", role: "super_agent" }, "ar"))
      .toBe("/ar/admin/super-agents?search=s%40x.com&open=s1");
    expect(assignmentHref({ _id: "e1", email: "e+hr@x.com", role: "employer" }, "en"))
      .toBe("/en/admin/employers?search=e%2Bhr%40x.com&open=e1");
  });

  it("has nothing to assign for other roles", () => {
    expect(assignmentHref({ _id: "j1", email: "j@x.com", role: "job_seeker" }, "en")).toBeNull();
    expect(assignmentHref({ _id: "ad", email: "ad@x.com", role: "admin" }, "en")).toBeNull();
  });
});
