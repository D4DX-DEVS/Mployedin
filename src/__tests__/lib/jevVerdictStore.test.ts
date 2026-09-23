/**
 * @jest-environment node
 *
 * The verdict key has to be a pure function of what Jev was shown. If two equal
 * inputs hashed differently, the same pair would be re-decided — and could read
 * a different percentage — depending on nothing but field order.
 */
import { stableStringify, verdictKey } from "@/lib/matching/jevVerdictStore";

describe("verdictKey", () => {
  it("is the same for equal inputs whatever order their fields were written in", () => {
    const a = { model: "m", state: { job: { title: "T", country: "in" }, candidate: { skills: ["a"] } } };
    const b = { state: { candidate: { skills: ["a"] }, job: { country: "in", title: "T" } }, model: "m" };
    expect(verdictKey(a)).toBe(verdictKey(b));
  });

  it("changes when anything Jev was shown changes", () => {
    const base = { model: "m", state: { candidate: { skills: ["React"] } } };
    expect(verdictKey(base)).not.toBe(verdictKey({ ...base, model: "m2" }));
    expect(verdictKey(base)).not.toBe(
      verdictKey({ model: "m", state: { candidate: { skills: ["React", "Node.js"] } } }),
    );
  });

  it("treats a reordered list as a different input", () => {
    // Jev sees the array in order; a reordered skills list is not the same prompt.
    expect(verdictKey({ s: ["a", "b"] })).not.toBe(verdictKey({ s: ["b", "a"] }));
  });

  it("ignores undefined fields, as JSON does", () => {
    expect(verdictKey({ a: 1, b: undefined })).toBe(verdictKey({ a: 1 }));
  });

  it("is a 64-character hex digest", () => {
    expect(verdictKey({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("stableStringify", () => {
  it("handles nulls, numbers and nested arrays", () => {
    expect(stableStringify({ b: [1, null, { d: 2, c: 3 }], a: null })).toBe(
      '{"a":null,"b":[1,null,{"c":3,"d":2}]}',
    );
  });
});
