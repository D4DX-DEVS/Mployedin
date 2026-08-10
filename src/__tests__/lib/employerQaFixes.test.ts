/**
 * @jest-environment node
 *
 * Regression checks for the employer-module QA fixes:
 *  - calendar feed URL must never be the internal proxy origin (localhost:8080)
 *  - the job wizard must reject experience min > max before submit
 *  - a numeric-only city must be rejected client- and server-side
 */
import { publicOrigin } from "@/lib/http/publicOrigin";
import { jobFormSchema } from "@/components/features/employer/job-form/jobFormSchema";
import { jobCreateSchema } from "@/lib/validators/jobs";

function req(url: string, headers: Record<string, string> = {}) {
  return { url, headers: new Headers(headers) };
}

const ORIGIN_ENV = ["NEXT_PUBLIC_BASE_URL", "NEXTAUTH_URL", "NEXT_PUBLIC_APP_URL"] as const;

describe("publicOrigin", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ORIGIN_ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ORIGIN_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("prefers the configured public URL over the internal request origin", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://app.mployedin.com/";
    expect(publicOrigin(req("http://localhost:8080/api/calendar/feed-token"))).toBe(
      "https://app.mployedin.com"
    );
  });

  it("falls back to the proxy's forwarded host, not localhost:8080", () => {
    expect(
      publicOrigin(
        req("http://localhost:8080/api/calendar/feed-token", {
          "x-forwarded-host": "mployedin-app.ondigitalocean.app",
          "x-forwarded-proto": "https",
          host: "localhost:8080",
        })
      )
    ).toBe("https://mployedin-app.ondigitalocean.app");
  });

  it("keeps http for a plain local host header", () => {
    expect(publicOrigin(req("http://localhost:3000/x", { host: "localhost:3000" }))).toBe(
      "http://localhost:3000"
    );
  });
});

const baseForm = {
  title: "Senior Backend Engineer",
  location: { country: "AE", city: "Dubai", isRemote: false },
  description: "We are hiring a backend engineer to build and run our APIs.",
  requirements: { skills: [], preferredSkills: [], experienceMin: 2, experienceMax: 8 },
  salary: { min: 5000, max: 9000, currency: "USD", isNegotiable: false, period: "monthly" },
};

describe("jobFormSchema", () => {
  it("accepts a sane experience range", () => {
    expect(jobFormSchema.safeParse(baseForm).success).toBe(true);
  });

  it("rejects experience min > max at the field the wizard highlights", () => {
    const res = jobFormSchema.safeParse({
      ...baseForm,
      requirements: { ...baseForm.requirements, experienceMin: 15, experienceMax: 10 },
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.map((i) => i.path.join("."))).toContain(
        "requirements.experienceMax"
      );
    }
  });

  it("reports a negative minimum salary as negative, not as a range error", () => {
    const res = jobFormSchema.safeParse({
      ...baseForm,
      salary: { ...baseForm.salary, min: -100 },
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path.join(".") === "salary.min");
      expect(issue?.message).toBe("Salary cannot be negative");
    }
  });

  it("rejects a numeric-only city", () => {
    const res = jobFormSchema.safeParse({
      ...baseForm,
      location: { ...baseForm.location, city: "12345" },
    });
    expect(res.success).toBe(false);
  });

  it("still accepts a non-Latin city name", () => {
    const res = jobFormSchema.safeParse({
      ...baseForm,
      location: { ...baseForm.location, city: "دبي" },
    });
    expect(res.success).toBe(true);
  });
});

describe("jobCreateSchema (server)", () => {
  const serverBase = {
    title: "Senior Backend Engineer",
    description: "We are hiring a backend engineer to build and run our APIs.",
    location: { country: "AE", city: "Dubai", isRemote: false },
  };

  it("rejects a numeric-only city", () => {
    expect(
      jobCreateSchema.safeParse({
        ...serverBase,
        location: { ...serverBase.location, city: "12345" },
      }).success
    ).toBe(false);
  });

  it("still rejects experience min > max (client now matches this)", () => {
    expect(
      jobCreateSchema.safeParse({
        ...serverBase,
        requirements: { experienceMin: 15, experienceMax: 10 },
      }).success
    ).toBe(false);
  });
});
