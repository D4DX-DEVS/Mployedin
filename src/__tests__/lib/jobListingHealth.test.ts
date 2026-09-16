/**
 * @jest-environment node
 *
 * The Listing Health panel and the form's own validation must agree. They did
 * not: the panel awarded its location point for any non-empty city, so a form
 * carrying City "12345" — which zod rejects — still read 80% "ready to
 * publish". Both now ask the same question.
 */
import { isPlausibleCityName, jobFormSchema } from "@/components/features/employer/job-form/jobFormSchema";

describe("isPlausibleCityName", () => {
  it("rejects an all-digit city, the value QA found restored from a stale draft", () => {
    expect(isPlausibleCityName("12345")).toBe(false);
  });

  it("rejects empty and punctuation-only values", () => {
    expect(isPlausibleCityName("")).toBe(false);
    expect(isPlausibleCityName("---")).toBe(false);
  });

  it("accepts real city names in any script, including ones carrying digits", () => {
    expect(isPlausibleCityName("Dubai")).toBe(true);
    expect(isPlausibleCityName("دبي")).toBe(true);
    expect(isPlausibleCityName("Sector 15 Noida")).toBe(true);
  });

  it("is the same rule the form schema enforces", () => {
    const parsed = jobFormSchema.shape.location.safeParse({ country: "AE", city: "12345", isRemote: false });
    expect(parsed.success).toBe(false);
  });
});
