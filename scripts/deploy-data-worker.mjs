/**
 * One-shot go-live step A (docs/CLOUDFLARE-STORAGE-MIGRATION-PLAN.md): deploy the
 * mployedin-data Worker, give it a fresh shared secret, check /health, and write
 * DATA_WORKER_URL / DATA_WORKER_SECRET into the app's .env. The secret is never
 * printed. Uses wrangler's own login (`npx wrangler login`), not the .env token.
 *
 *   node scripts/deploy-data-worker.mjs            # keeps an existing DATA_WORKER_SECRET in .env
 *   node scripts/deploy-data-worker.mjs --rotate   # always makes a new one
 *
 * Safe to re-run. Restart the app afterwards so it reads the new .env.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerDir = path.join(root, "workers", "mployedin-data");
const envPath = path.join(root, ".env");
const out = (line) => process.stdout.write(`${line}\n`);

// wrangler must use its OAuth login: the .env token cannot deploy.
const childEnv = { ...process.env };
delete childEnv.CLOUDFLARE_API_TOKEN;
delete childEnv.CLOUDFLARE_ACCOUNT_ID;

function wrangler(args, input) {
  const res = spawnSync("npx", ["--no-install", "wrangler", ...args], {
    cwd: workerDir,
    env: childEnv,
    input,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return { ok: res.status === 0, text: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

function readEnv() {
  try {
    return readFileSync(envPath, "utf8");
  } catch {
    return "";
  }
}

function envValue(text, name) {
  const m = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

function setEnv(text, name, value) {
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return `${text}${text.endsWith("\n") || text === "" ? "" : eol}${line}${eol}`;
}

out("1/4 Deploying the Worker…");
const deploy = wrangler(["deploy"]);
if (!deploy.ok) {
  out(deploy.text);
  process.exit(1);
}
const url = deploy.text.match(/https:\/\/mployedin-data\.[a-z0-9-]+\.workers\.dev/)?.[0];
if (!url) {
  out(deploy.text);
  out("Deployed, but the workers.dev URL was not in the output. Set DATA_WORKER_URL by hand.");
  process.exit(1);
}
out(`    ${url}`);

let env = readEnv();
const existing = envValue(env, "DATA_WORKER_SECRET");
const secret = !process.argv.includes("--rotate") && existing && existing.length >= 32 ? existing : randomBytes(32).toString("hex");

out("2/4 Setting the Worker secret (not shown)…");
const put = wrangler(["secret", "put", "DATA_WORKER_SECRET"], `${secret}\n`);
if (!put.ok) {
  out(put.text.replaceAll(secret, "***"));
  process.exit(1);
}

out("3/4 Writing DATA_WORKER_URL and DATA_WORKER_SECRET to .env…");
env = setEnv(env, "DATA_WORKER_URL", url);
env = setEnv(env, "DATA_WORKER_SECRET", secret);
writeFileSync(envPath, env);

out("4/4 Checking /health…");
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    const res = await fetch(`${url}/health`);
    const body = await res.text();
    if (res.ok) {
      out(`    ${res.status} ${body}`);
      out("Done. Restart the app (port 3888) so it picks up the new .env.");
      process.exit(0);
    }
    out(`    attempt ${attempt}: ${res.status} ${body}`);
  } catch (err) {
    out(`    attempt ${attempt}: ${err instanceof Error ? err.message : String(err)}`);
  }
  await new Promise((r) => setTimeout(r, 3000));
}
out("Deployed, but /health did not answer OK yet. workers.dev can take a minute for a new Worker: try the URL again shortly.");
process.exit(1);
