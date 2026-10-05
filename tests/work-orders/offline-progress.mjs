import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import vm from "node:vm";
const storage = new Map(),
  calls = [];
let user = "tech-a",
  online = false,
  mode = "ok";
const supabase = {
  auth: {
    async getSession() {
      return { data: { session: { user: { id: user } } } };
    },
  },
  async rpc(name, event) {
    calls.push(event);
    return {
      error:
        mode === "conflict"
          ? { message: "Task changed on another visit" }
          : null,
    };
  },
};
const module = { exports: {} };
vm.runInNewContext(
  transformSync(readFileSync("src/lib/jobOffline.ts", "utf8"), {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  }).code,
  {
    module,
    exports: module.exports,
    require: () => ({ supabase }),
    navigator: {
      get onLine() {
        return online;
      },
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    Date,
    Map,
    Promise,
    JSON,
    Error,
  },
);
const api = module.exports,
  event = {
    p_assignment_id: "task",
    p_disposition: "partial",
    p_notes: "Return for trim",
    p_complete_project: false,
    p_event_id: "retry-1",
    p_expected_version: 2,
  };
api.queueVisitEvent("tech-a", event);
api.queueVisitEvent("tech-a", event);
assert.equal(api.pendingVisitEvents("tech-a").length, 1);
await api.syncVisitEvents("tech-a");
assert.equal(calls.length, 0, "Offline writes remain durable");
assert.equal(
  api.pendingVisitEvents("tech-b").length,
  0,
  "Another account cannot inherit updates",
);
api.cacheVisitPacket("tech-a", "order", {
  scope: "Original room scope",
  assignments: [event],
});
assert.equal(
  api.readVisitPacket("tech-a", "order").packet.scope,
  "Original room scope",
);
assert.equal(api.readVisitPacket("tech-b", "order"), null);
online = true;
user = "tech-b";
await assert.rejects(api.syncVisitEvents("tech-a"), /owner/);
assert.equal(calls.length, 0);
user = "tech-a";
mode = "conflict";
await assert.rejects(api.syncVisitEvents("tech-a"), /./);
assert.equal(
  api.pendingVisitEvents("tech-a")[0].error,
  "Task changed on another visit",
);
assert.equal(
  api.pendingVisitEvents("tech-a")[0].event.p_expected_version,
  2,
  "Conflict does not silently overwrite a newer assignment",
);
mode = "ok";
await Promise.all([
  api.syncVisitEvents("tech-a"),
  api.syncVisitEvents("tech-a"),
]);
assert.equal(api.pendingVisitEvents("tech-a").length, 0);
assert.equal(
  calls.at(-1).p_event_id,
  "retry-1",
  "Retry uses the original idempotency key",
);
api.queueVisitEvent("tech-a", { ...event, p_event_id: "discard" });
api.discardVisitEvent("tech-a", "discard");
assert.equal(api.pendingVisitEvents("tech-a").length, 0);
console.log(
  "Offline progress tests passed: durable updates, account isolation, stable retry IDs, concurrency and explicit conflict handling.",
);
