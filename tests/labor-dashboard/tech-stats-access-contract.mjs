import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Regression guard: a permitted service manager must use the same
// production-reporting path as an administrator, without opening the
// separate payroll/labor administration API.
const loader = readFileSync("src/lib/techProductionData.ts", "utf8");
const rpc = readFileSync("supabase/migrations/20261023114939_tech_production_report.sql", "utf8");

assert.match(loader, /rpc\(["']get_tech_production["']/);
assert.doesNotMatch(
  loader,
  /if\s*\(viewer\.role\s*===\s*["']admin["']\)/,
  "Tech Stats must not silently downgrade permitted managers to native-only data",
);
assert.match(
  rpc,
  /tech_stats/i,
  "Production RPC must verify effective tech_stats permission server-side",
);
assert.match(rpc, /auth\.uid\(\)/, "RPC must authenticate the viewer");
assert.doesNotMatch(
  rpc,
  /jsonb_agg\(to_jsonb\(c\)\)/,
  "Do not expose raw payroll configuration objects",
);
assert.doesNotMatch(
  rpc,
  /jsonb_agg\(to_jsonb\(s\)\)/,
  "Do not expose raw imported snapshots",
);
console.log("Tech Stats authorization contract passed.");
