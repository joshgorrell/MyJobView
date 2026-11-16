import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const compile = (path) =>
  ts.transpileModule(
    readFileSync(
      new URL("../../supabase/functions/_shared/" + path, import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
const data = (code) =>
  "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const directory = data(compile("ringcentral-directory.ts"));
const { voicemailFilters, listRingCentralRecords } = await import(directory);
const { syncVoicemailSubscription } = await import(
  data(
    compile("ringcentral-subscriptions.ts").replace(
      /["']\.\/ringcentral-directory\.ts["']/g,
      JSON.stringify(directory),
    ),
  )
);
const { validateRingCentralWebhook } = await import(
  data(compile("ringcentral-webhook-ingress.ts"))
);
const { RingCentralMailboxResolver } = await import(
  data(compile("ringcentral-mailbox-resolver.ts"))
);
const response = (body) => new Response(JSON.stringify(body), { status: 200 });
const address = "https://db.example/functions/v1/ringcentral-voicemail-webhook";
test("filters are explicit, deduplicated and cannot substitute aliases or arbitrary paths", () => {
  assert.deepEqual(voicemailFilters("123", ["456", "789", "456"]), [
    "/restapi/v1.0/account/123/extension/456/voicemail",
    "/restapi/v1.0/account/123/extension/789/voicemail",
  ]);
  assert.throws(() => voicemailFilters("123", ["~/../bad"]));
});
test("discovery reads every page and refuses partial provider results", async () => {
  const calls = [];
  const result = await listRingCentralRecords(async (path) => {
    calls.push(path);
    return response({
      records: [{ id: calls.length }],
      paging: { totalPages: 2 },
    });
  }, "account/~/extension");
  assert.equal(result.length, 2);
  assert.match(calls[1], /page=2&perPage=100/);
  await assert.rejects(
    listRingCentralRecords(
      async () => response({ records: [], paging: { totalPages: 99 } }),
      "account/~/extension",
      2,
    ),
    /incomplete/,
  );
  await assert.rejects(
    listRingCentralRecords(
      async () => new Response("", { status: 403 }),
      "account/~/extension",
    ),
    /permission_required/,
  );
});
test("subscription update covers all selected mailboxes and preserves unrelated subscriptions", async () => {
  const calls = [];
  const provider = async (path, init) => {
    calls.push({ path, init });
    if (!init)
      return response({
        records: [
          {
            id: "foreign",
            status: "Active",
            eventFilters: ["unrelated"],
            deliveryMode: {
              transportType: "WebHook",
              address: "https://other.example",
            },
          },
          {
            id: "ours",
            status: "Active",
            eventFilters: ["/restapi/v1.0/account/~/extension/~/voicemail"],
            deliveryMode: { transportType: "WebHook", address },
          },
        ],
      });
    return response({ expirationTime: "2026-11-23T00:00:00Z" });
  };
  const result = await syncVoicemailSubscription(
    provider,
    "123",
    ["456", "789"],
    address,
    "secret",
    true,
  );
  assert.equal(result.mailboxes, 2);
  assert.equal(calls[1].path, "subscription/ours");
  assert.equal(calls[1].init.method, "PUT");
  assert.equal(JSON.parse(calls[1].init.body).eventFilters.length, 2);
});
test("scheduler cannot silently create a missing subscription or choose among duplicates", async () => {
  await assert.rejects(
    syncVoicemailSubscription(
      async () => response({ records: [] }),
      "123",
      ["456"],
      address,
      "secret",
      false,
    ),
    /missing/,
  );
  const record = {
    id: "ours",
    eventFilters: ["/restapi/v1.0/account/123/extension/456/voicemail"],
    deliveryMode: { transportType: "WebHook", address },
  };
  await assert.rejects(
    syncVoicemailSubscription(
      async () =>
        response({ records: [record, { ...record, id: "duplicate" }] }),
      "123",
      ["456"],
      address,
      "secret",
      true,
    ),
    /multiple/,
  );
});
test("documented account alias resolves only through a canonical stored enabled mailbox", async () => {
  const filters = [];
  const query = {
    eq(k, v) {
      filters.push([k, v]);
      return this;
    },
    maybeSingle: async () => ({
      data: { organization_id: "org", ringcentral_account_id: "123" },
      error: null,
    }),
  };
  const resolver = new RingCentralMailboxResolver({
    from: () => ({ select: () => query }),
  });
  const result = await validateRingCentralWebhook(
    {
      headers: { get: (k) => (k === "verification-token" ? "secret" : null) },
      json: async () => ({
        event: "/restapi/v1.0/account/~/extension/456/voicemail",
        body: { id: "789", type: "VoiceMail" },
      }),
    },
    "secret",
    resolver,
  );
  assert.equal(result.voicemail.accountId, "123");
  assert.equal(result.voicemail.extensionId, "456");
  assert.deepEqual(filters, [
    ["ringcentral_extension_id", "456"],
    ["enabled", true],
  ]);
});
test("ambiguous alias fails closed instead of crossing accounts", async () => {
  const query = {
    eq() {
      return this;
    },
    maybeSingle: async () => ({ data: null, error: { code: "PGRST116" } }),
  };
  await assert.rejects(
    new RingCentralMailboxResolver({
      from: () => ({ select: () => query }),
    }).resolve("~", "456"),
  );
});
