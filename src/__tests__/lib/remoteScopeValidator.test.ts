/**
 * @jest-environment node
 */
/**
 * The remote hiring scope has to survive the write path, not just the matcher.
 * (Node environment: the validator barrel imports `next/server`.)
 *
 * `isRemote` says how the work is done; it says nothing about who may legally
 * be hired to do it. The gate in `eligibility.ts` reads `remoteScope` — so if
 * the API silently drops the field, or lets a half-filled one through, the gate
 * falls back to the job's own country and the employer never finds out why
 * their worldwide role is only reaching one country.
 */

import { jobCreateSchema } from "@/lib/validators/jobs";

function baseJob(location: Record<string, unknown>) {
  return {
    title: "Senior Platform Engineer",
    description: "We are hiring a platform engineer to look after our build and release tooling.",
    location,
    requirements: { skills: ["Kubernetes"] },
  };
}

describe("job validator — remote hiring scope", () => {
  it("accepts a worldwide remote job", () => {
    const parsed = jobCreateSchema.safeParse(
      baseJob({ country: "India", city: "Kochi", isRemote: true, remoteScope: "worldwide" }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.location?.remoteScope).toBe("worldwide");
  });

  it("accepts a country-restricted remote job and keeps the list", () => {
    const parsed = jobCreateSchema.safeParse(
      baseJob({
        country: "Qatar",
        city: "Doha",
        isRemote: true,
        remoteScope: "countries",
        remoteCountries: ["Qatar", "India"],
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.location?.remoteCountries).toEqual(["Qatar", "India"]);
  });

  it("rejects a restricted scope with no countries", () => {
    // Saved as-is this reads "remote, but nobody qualifies", which the gate
    // would have to interpret. Refuse it at the boundary instead.
    const parsed = jobCreateSchema.safeParse(
      baseJob({
        country: "Qatar",
        city: "Doha",
        isRemote: true,
        remoteScope: "countries",
        remoteCountries: [],
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects a hiring scope on a job that is not remote", () => {
    const parsed = jobCreateSchema.safeParse(
      baseJob({ country: "India", city: "Kochi", isRemote: false, remoteScope: "worldwide" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("still accepts a job that says nothing about remote scope", () => {
    // Every job posted before this field existed. Absent must stay valid, and
    // must not acquire a default — the gate treats it as the job's own country.
    const parsed = jobCreateSchema.safeParse(
      baseJob({ country: "India", city: "Kochi", isRemote: true }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.location?.remoteScope).toBeUndefined();
  });
});
