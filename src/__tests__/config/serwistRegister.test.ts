/**
 * @jest-environment node
 *
 * Guard: Serwist must not register the service worker by itself.
 *
 * @serwist/next defaults `register` to true, which makes it register /sw.js on
 * every page for every anonymous visitor, before any consent choice. Our own
 * ServiceWorkerRegistration registers the worker only after the person opts in
 * and unregisters it otherwise; with Serwist auto-registering as well, the two
 * fight and the worker is installed for people who never agreed (UK PECR /
 * GDPR). A live production-build check found exactly that.
 *
 * next.config.ts is read as text because importing it would pull in the whole
 * Next + next-intl plugin chain, and the setting only matters in production.
 */
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

/** The text of the object literal passed to withSerwistInit({ ... }). */
function serwistOptions(): string {
  const call = source.indexOf("withSerwistInit(");
  expect(call).toBeGreaterThan(-1);
  const open = source.indexOf("{", call);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(open, i + 1);
  }
  throw new Error("withSerwistInit options are not closed");
}

describe("next.config.ts Serwist options", () => {
  it("turns off Serwist's own service worker registration", () => {
    expect(serwistOptions()).toMatch(/\bregister:\s*false\b/);
  });

  it("still builds the worker from src/app/sw.ts into public/sw.js", () => {
    const options = serwistOptions();
    expect(options).toMatch(/swSrc:\s*"src\/app\/sw\.ts"/);
    expect(options).toMatch(/swDest:\s*"public\/sw\.js"/);
  });
});
