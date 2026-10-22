/**
 * Production build for the cookie-consent E2E, into `.next-e2e` (never `.next`,
 * which the dev server and other builds use).
 *
 * Usage:
 *   node scripts/e2e-prod-build.mjs
 *   NEXT_DIST_DIR=.next-e2e npx next start -p 3890
 *   E2E_BASE_URL=http://localhost:3890 npx playwright test e2e/cookie-consent.spec.ts e2e/consent-signed-in.spec.ts --project desktop-chromium
 *
 * Why a script: with a distDir other than `.next`, `next build` rewrites two
 * tracked files to point at `.next-e2e/types` (tsconfig.json "include" and
 * next-env.d.ts), which other sessions type-check. This script keeps a copy of
 * both, puts them back whenever the build changes them (so the window is about
 * a second) and once more when it ends, then checks they are byte-identical to
 * the copies. It exits non-zero if the build fails or a file could not be
 * restored. It does not read .env and touches nothing else.
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEPT = ["tsconfig.json", "next-env.d.ts"].map((name) => path.join(root, name));
const copies = new Map(KEPT.map((file) => [file, readFileSync(file)]));

function restore(when) {
  for (const [file, bytes] of copies) {
    let now;
    try {
      now = readFileSync(file);
    } catch {
      now = null;
    }
    if (now === null || !now.equals(bytes)) {
      writeFileSync(file, bytes);
      console.warn(`[e2e-prod-build] restored ${path.basename(file)} (${when})`);
    }
  }
}

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "build", "--webpack"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-e2e",
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=8192"].filter(Boolean).join(" "),
  },
});

const timer = setInterval(() => restore("during the build"), 500);

child.on("exit", (code, signal) => {
  clearInterval(timer);
  restore("after the build");
  const mismatched = KEPT.filter((file) => !readFileSync(file).equals(copies.get(file)));
  if (mismatched.length > 0) {
    console.error(`[e2e-prod-build] NOT byte-identical after restore: ${mismatched.map((f) => path.basename(f)).join(", ")}`);
    process.exit(2);
  }
  console.warn("[e2e-prod-build] tsconfig.json and next-env.d.ts are byte-identical to before the build");
  process.exit(code ?? (signal ? 1 : 0));
});
