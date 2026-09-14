/**
 * @jest-environment node
 */
import { typeToCategory } from "@/models/NotificationPreference";

describe("job_seeker_registered notification", () => {
  it("routes to the system category like employer_registered", () => {
    expect(typeToCategory("job_seeker_registered")).toBe("system");
    expect(typeToCategory("employer_registered")).toBe("system");
  });
});
