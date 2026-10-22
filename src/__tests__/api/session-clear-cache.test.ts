/**
 * @jest-environment node
 *
 * After sign-out the browser HTTP cache still held signed-in API replies
 * (`Cache-Control: private, max-age=...`), so an offline fetch of
 * /api/jobs?myJobs=true returned the previous user's data. Sign-out calls this
 * route; its Clear-Site-Data header makes the browser drop its cache.
 */
import * as route from "@/app/api/session/clear-cache/route";
import { isCsrfExempt } from "@/lib/security/csrf";

async function post(): Promise<Response> {
  return route.POST();
}

describe("POST /api/session/clear-cache", () => {
  it("answers 204 with no body", async () => {
    const res = await post();

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("asks the browser to clear its HTTP cache", async () => {
    const res = await post();

    expect(res.headers.get("Clear-Site-Data")).toBe('"cache"');
  });

  it("is never cached itself", async () => {
    const res = await post();

    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("accepts POST only", () => {
    const exported = Object.keys(route).filter((key) => /^(GET|HEAD|PUT|PATCH|DELETE|OPTIONS)$/.test(key));

    expect(exported).toEqual([]);
  });

  it("stays behind the normal CSRF check, so a cross-site page cannot trigger it", () => {
    expect(isCsrfExempt("/api/session/clear-cache")).toBe(false);
  });
});
