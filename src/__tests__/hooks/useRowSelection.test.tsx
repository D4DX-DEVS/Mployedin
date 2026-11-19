/**
 * @jest-environment jsdom
 *
 * Row selection for a paged list: ticked rows are remembered whole (so an
 * export can name them and build its sheet after the page has changed), the
 * header checkbox covers the rows on the page, and order is the order ticked.
 */
import { act, renderHook } from "@testing-library/react";

import { useRowSelection } from "@/hooks/useRowSelection";

interface Row { _id: string; name: string }
const row = (n: number): Row => ({ _id: `id${n}`, name: `Row ${n}` });
const idOf = (r: Row) => r._id;

describe("useRowSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useRowSelection(idOf));
    expect(result.current.count).toBe(0);
    expect(result.current.items).toEqual([]);
    expect(result.current.isSelected("id1")).toBe(false);
  });

  it("toggles a row on and off", () => {
    const { result } = renderHook(() => useRowSelection(idOf));
    act(() => result.current.toggle(row(1)));
    expect(result.current.isSelected("id1")).toBe(true);
    expect(result.current.count).toBe(1);
    act(() => result.current.toggle(row(1)));
    expect(result.current.isSelected("id1")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("keeps the rows themselves, in the order they were ticked", () => {
    const { result } = renderHook(() => useRowSelection(idOf));
    act(() => result.current.toggle(row(3)));
    act(() => result.current.toggle(row(1)));
    expect(result.current.items).toEqual([row(3), row(1)]);
  });

  it("reports the page as none, some or all selected", () => {
    const page = [row(1), row(2), row(3)];
    const { result } = renderHook(() => useRowSelection(idOf));
    expect(result.current.pageState(page)).toBe("none");
    act(() => result.current.toggle(row(2)));
    expect(result.current.pageState(page)).toBe("some");
    act(() => result.current.togglePage(page));
    expect(result.current.pageState(page)).toBe("all");
  });

  it("an empty page is none, never all", () => {
    const { result } = renderHook(() => useRowSelection(idOf));
    expect(result.current.pageState([])).toBe("none");
  });

  it("select-all on the page adds the rows not yet ticked; again, it takes the page off", () => {
    const page = [row(1), row(2), row(3)];
    const { result } = renderHook(() => useRowSelection(idOf));
    act(() => result.current.toggle(row(2)));
    act(() => result.current.togglePage(page));
    expect(result.current.items.map(idOf)).toEqual(["id2", "id1", "id3"]);

    act(() => result.current.togglePage(page));
    expect(result.current.count).toBe(0);
  });

  it("taking a page off leaves rows ticked on other pages", () => {
    const { result } = renderHook(() => useRowSelection(idOf));
    act(() => result.current.toggle(row(9)));
    act(() => result.current.togglePage([row(1), row(2)]));
    act(() => result.current.togglePage([row(1), row(2)]));
    expect(result.current.items).toEqual([row(9)]);
  });

  it("clear empties it", () => {
    const { result } = renderHook(() => useRowSelection(idOf));
    act(() => result.current.togglePage([row(1), row(2)]));
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
    expect(result.current.items).toEqual([]);
  });

  it("changes the toggle/clear callbacks' identity never (safe in effect deps)", () => {
    const { result, rerender } = renderHook(() => useRowSelection(idOf));
    const first = { toggle: result.current.toggle, togglePage: result.current.togglePage, clear: result.current.clear };
    act(() => result.current.toggle(row(1)));
    rerender();
    expect(result.current.toggle).toBe(first.toggle);
    expect(result.current.togglePage).toBe(first.togglePage);
    expect(result.current.clear).toBe(first.clear);
  });
});
