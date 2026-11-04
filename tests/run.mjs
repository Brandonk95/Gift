// Runs every test. See the Tests section of the README for setup.
//
//   node tests/run.mjs            unit tests only (no server needed)
//   node tests/run.mjs --api      unit + API tests against TEST_URL
//
// API tests create throwaway users and lists, so point TEST_URL at a test server,
// never production. They turn off rate limits on that server while they run and
// turn them back on afterwards.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const api = process.argv.includes("--api");
const base = process.env.TEST_URL || "http://127.0.0.1:8090";
const files = readdirSync(dir)
  .filter((f) => /^unit-.*\.c?js$/.test(f) || (api && /^api-.*\.mjs$/.test(f)))
  .sort((a, b) => (a.startsWith("unit") === b.startsWith("unit") ? a.localeCompare(b) : a.startsWith("unit") ? -1 : 1));

async function superuser() {
  const r = await fetch(`${base}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`Superuser login failed (${r.status}). Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for the test server.`);
  return (await r.json()).token;
}
const setRateLimits = (token, enabled) =>
  fetch(`${base}/api/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json", Authorization: token },
    body: JSON.stringify({ rateLimits: { enabled } }),
  });

let token = null, limitsWereOn = false;
if (api) {
  token = await superuser();
  const s = await (await fetch(`${base}/api/settings`, { headers: { Authorization: token } })).json();
  limitsWereOn = !!s.rateLimits?.enabled;
  if (limitsWereOn) await setRateLimits(token, false);
}

const failed = [];
try {
  for (const f of files) {
    console.log(`\n=== ${f}`);
    const r = spawnSync(process.execPath, [join(dir, f)], { stdio: "inherit", env: process.env });
    if (r.status !== 0) failed.push(f);
  }
} finally {
  if (limitsWereOn) await setRateLimits(token, true);
}

console.log(failed.length ? `\n${failed.length} of ${files.length} test files failed: ${failed.join(", ")}` : `\nall ${files.length} test files passed`);
if (!api) console.log("(API tests skipped: add --api to run them against TEST_URL)");
process.exitCode = failed.length ? 1 : 0;
