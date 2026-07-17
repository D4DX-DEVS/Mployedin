import { buildJobFilterOptions } from "@/lib/jobs/duplicateJobLabels";

// Local-time strings (no trailing "Z") keep the same-day grouping deterministic
// regardless of the test runner's timezone.
const opts = { allLabel: "All Jobs", latestLabel: "Latest", dateLocale: "en-US" };
const byId = (jobs: Parameters<typeof buildJobFilterOptions>[0]) =>
  Object.fromEntries(buildJobFilterOptions(jobs, opts).map((o) => [o.value, o.label]));

test("prepends the All Jobs option", () => {
  expect(buildJobFilterOptions([], opts)).toEqual([{ value: "", label: "All Jobs" }]);
});

test("a unique title stays clean (no date/tag suffix)", () => {
  const labels = byId([{ _id: "1", title: "Frontend Developer", createdAt: "2026-06-15T10:00:00" }]);
  expect(labels["1"]).toBe("Frontend Developer");
});

test("duplicate titles (even with case/space differences) are detected and disambiguated", () => {
  const labels = byId([
    { _id: "a", title: "UI/UX Designer", createdAt: "2026-06-15T10:00:00" },
    { _id: "b", title: "ui/ux  designer ", createdAt: "2026-06-06T10:00:00" }, // variant → same group
  ]);
  expect(labels["a"]).toContain("Latest"); // newest tagged
  expect(labels["b"]).not.toContain("Latest");
  expect(labels["b"]).toContain("2026"); // older one carries its date
});

test("same-day duplicates include the time so they never render identically", () => {
  const labels = byId([
    { _id: "a", title: "UI/UX Designer", createdAt: "2026-06-06T14:14:00" },
    { _id: "b", title: "UI/UX Designer", createdAt: "2026-06-06T09:03:00" },
  ]);
  expect(labels["a"]).toContain("Latest");
  expect(labels["b"]).toMatch(/\d:\d{2}/); // time-of-day present
  expect(labels["a"]).not.toBe(labels["b"]); // guaranteed distinct
});
