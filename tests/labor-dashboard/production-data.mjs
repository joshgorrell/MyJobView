import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";
const calls = [];
let callback;
let fail = false;
let release;
let defer = false;
const bundle = { sources: [], roster: [], snapshots: [] };
const supabase = {
  auth: {
    onAuthStateChange(fn) {
      callback = fn;
    },
  },
  rpc(name, args) {
    calls.push({ name, args });
    return {
      abortSignal: async () => {
        if (defer)
          await new Promise((resolve) => {
            release = resolve;
          });
        return {
          data: bundle,
          error: fail ? { message: "unavailable" } : null,
        };
      },
    };
  },
  from() {
    throw Error("Unexpected native lookup for admin");
  },
};
const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/lib/techProductionData.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    module,
    exports: module.exports,
    require: (name) =>
      name === "./supabase"
        ? { supabase }
        : { getOrganizationTimezone: async () => "America/Chicago" },
    Date,
    Map,
    Error,
  },
);
const { loadProduction, readPages } = module.exports;
const identity = { id: "admin", organization_id: "org", role: "admin" },
  signal = new AbortController().signal;
await loadProduction(identity, "2026-10-01", "2026-10-22", signal);
await loadProduction(identity, "2026-10-01", "2026-10-22", signal);
assert.equal(calls.length, 1, "same report reuses fresh in-memory data");
assert.equal(calls[0].name, "get_tech_production");
await loadProduction(
  { ...identity, id: "different-admin" },
  "2026-10-01",
  "2026-10-22",
  signal,
);
assert.equal(calls.length, 2, "cache is viewer scoped");
await loadProduction(
  { ...identity, organization_id: "other-org" },
  "2026-10-01",
  "2026-10-22",
  signal,
);
assert.equal(calls.length, 3, "cache is organization scoped");
await loadProduction(identity, "2026-10-01", "2026-10-22", signal, true);
assert.equal(calls.length, 4, "manual refresh bypasses cache");
callback("SIGNED_OUT");
await loadProduction(identity, "2026-10-01", "2026-10-22", signal);
assert.equal(calls.length, 5, "sign-out clears reports");
fail = true;
await assert.rejects(
  () => loadProduction(identity, "2026-10-01", "2026-10-22", signal, true),
  /unavailable/,
);
fail = false;
defer = true;
const pending = loadProduction(
  identity,
  "2026-10-01",
  "2026-10-22",
  signal,
  true,
);
callback("SIGNED_OUT");
release();
await assert.rejects(
  () => pending,
  /cancelled/,
  "in-flight responses cannot refill the cache after sign-out",
);
defer = false;
const pages = [];
const rows = await readPages(async (from, to) => {
  pages.push([from, to]);
  return {
    data: Array.from({ length: from === 0 ? 1000 : 4 }, (_, i) => ({
      id: from + i,
    })),
    error: null,
  };
}, signal);
assert.equal(rows.length, 1004);
assert.equal(
  pages[1][0],
  1000,
  "reports do not silently truncate at API page size",
);
const abort = new AbortController();
abort.abort();
await assert.rejects(
  () =>
    readPages(() => {
      throw Error("must not query");
    }, abort.signal),
  /cancelled/,
);
console.log(
  "Production data: small RPC, viewer-scoped cache, refresh, sign-out, errors, cancellation and pagination passed.",
);
