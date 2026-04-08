/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "@/hooks/useDebounce";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useDebounce", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 500));
    expect(result.current).toBe("hello");
  });

  it("does not update value before delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "a", delay: 300 } },
    );

    rerender({ value: "b", delay: 300 });

    // Advance time but not enough
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBe("a");
  });

  it("updates value after delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "a", delay: 300 } },
    );

    rerender({ value: "b", delay: 300 });

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe("b");
  });

  it("resets timer when value changes before delay completes", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "a", delay: 300 } },
    );

    // First change
    rerender({ value: "b", delay: 300 });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Second change before timer fires — should reset
    rerender({ value: "c", delay: 300 });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // "b" should never have been set; still the initial "a"
    expect(result.current).toBe("a");

    // Now let the full delay pass for "c"
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe("c");
  });

  it("works with numeric values", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 0, delay: 200 } },
    );

    rerender({ value: 42, delay: 200 });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBe(42);
  });

  it("works with object values (identity changes)", () => {
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: obj1, delay: 100 } },
    );

    rerender({ value: obj2, delay: 100 });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toEqual({ id: 2 });
  });

  it("handles delay of 0", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "x", delay: 0 } },
    );

    rerender({ value: "y", delay: 0 });
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(result.current).toBe("y");
  });

  it("handles rapid successive changes — only final value wins", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "v1", delay: 500 } },
    );

    rerender({ value: "v2", delay: 500 });
    act(() => { jest.advanceTimersByTime(100); });

    rerender({ value: "v3", delay: 500 });
    act(() => { jest.advanceTimersByTime(100); });

    rerender({ value: "v4", delay: 500 });
    act(() => { jest.advanceTimersByTime(100); });

    rerender({ value: "v5", delay: 500 });

    // Still holding initial value
    expect(result.current).toBe("v1");

    act(() => { jest.advanceTimersByTime(500); });

    // Only the last value should win
    expect(result.current).toBe("v5");
  });
});
