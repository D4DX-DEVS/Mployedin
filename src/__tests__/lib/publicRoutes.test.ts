/**
 * @jest-environment node
 */

import { isPublicRoute } from "@/lib/routing/publicRoutes";

describe("isPublicRoute", () => {
  it.each([
    "/en/companies",
    "/ar/companies",
    "/en/terms",
    "/ar/gdpr",
    "/ar/salary-explorer",
    "/ar/agent-register",
    "/ar/jobs/abc123",
  ])("allows public localized route %s", (pathname) => {
    expect(isPublicRoute(pathname)).toBe(true);
  });

  it.each(["/en/admin", "/ar/employer", "/ar/job-seeker/applications"])(
    "keeps dashboard route %s protected",
    (pathname) => {
      expect(isPublicRoute(pathname)).toBe(false);
    }
  );

  it("does not allow partial prefix lookalikes", () => {
    expect(isPublicRoute("/ar/jobs-admin")).toBe(false);
  });
});