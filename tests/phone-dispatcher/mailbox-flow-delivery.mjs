import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(
  new URL(
    "../../supabase/functions/_shared/phone-voicemail-flow.ts",
    import.meta.url,
  ),
  "utf8",
);
const js = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    /import \{ deliverVoicemailEmail \} from [\"'][^\"']+[\"'];/,
    "const deliverVoicemailEmail=(db,input)=>db.email(input);",
  );
const { publishVoicemailToFlow } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
function setup({
  old = false,
  workflow = "assigned",
  linked = false,
  disabled = false,
} = {}) {
  const tables = {
    voicemail_messages: [
      {
        id: "vm",
        organization_id: "org",
        ringcentral_account_id: "123",
        ringcentral_extension_id: "456",
        assigned_user_id: "bobbi",
        workflow_status: workflow,
        received_at: new Date(
          Date.now() - (old ? 180 : 1) * 60000,
        ).toISOString(),
        contact_id: "customer",
        service_request_id: linked ? "request" : null,
      },
    ],
    ringcentral_mailboxes: [
      {
        id: "box",
        organization_id: "org",
        ringcentral_account_id: "123",
        ringcentral_extension_id: "456",
        enabled: true,
        default_department: "service",
        escalation_minutes: 120,
      },
    ],
    ringcentral_mailbox_recipients: [
      {
        mailbox_id: "box",
        organization_id: "org",
        user_id: "bobbi",
        recipient_role: "responsible",
        email_enabled: true,
      },
      {
        mailbox_id: "box",
        organization_id: "org",
        user_id: "josh",
        recipient_role: "backup",
        email_enabled: true,
      },
    ],
    phone_voicemail_department_access: [
      { organization_id: "org", user_id: "bobbi", department: "service" },
      { organization_id: "org", user_id: "josh", department: "service" },
    ],
    profiles: [
      {
        id: "bobbi",
        organization_id: "org",
        email: "bobbi@example.com",
        is_active: !disabled,
        my_job_view_enabled: true,
        role: "service_manager",
      },
      {
        id: "josh",
        organization_id: "org",
        email: "josh@example.com",
        is_active: true,
        my_job_view_enabled: true,
        role: "admin",
      },
      {
        id: "foreign",
        organization_id: "other",
        email: "other@example.com",
        is_active: true,
        my_job_view_enabled: true,
        role: "admin",
      },
    ],
    flow_events: [],
    notifications: [],
  };
  const emailCalls = [];
  const receipts = new Set();
  const db = {
    email: async (input) => {
      const key = input.voicemailId + input.userId + input.kind;
      if (!receipts.has(key)) {
        receipts.add(key);
        emailCalls.push(input);
      }
    },
    from(table) {
      let filters = [],
        inserts = null;
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          filters.push((r) => r[k] === v);
          return q;
        },
        in(k, vs) {
          filters.push((r) => vs.includes(r[k]));
          return q;
        },
        limit() {
          return q;
        },
        insert(row) {
          inserts = row;
          return q;
        },
        maybeSingle() {
          return run(true);
        },
        then(resolve, reject) {
          return run(false).then(resolve, reject);
        },
      };
      async function run(single) {
        if (inserts) {
          tables[table].push({ ...inserts, id: tables[table].length + 1 });
          return { data: null, error: null };
        }
        const rows = tables[table].filter((r) => filters.every((f) => f(r)));
        return { data: single ? (rows[0] ?? null) : rows, error: null };
      }
      return q;
    },
  };
  return { db, tables, emailCalls };
}
const input = {
  id: "vm",
  organizationId: "org",
  department: "service",
  summary: "needs help",
  state: "ready",
  urgent: false,
};
test("mapped owner gets one Flow event, notification and email; retries remain idempotent", async () => {
  const x = setup();
  await publishVoicemailToFlow(x.db, input);
  await publishVoicemailToFlow(x.db, input);
  assert.equal(x.tables.flow_events.length, 1);
  assert.equal(x.tables.flow_events[0].contact_id, "customer");
  assert.equal(x.tables.notifications.length, 1);
  assert.equal(x.tables.notifications[0].user_id, "bobbi");
  assert.equal(x.emailCalls.length, 1);
  assert.equal(x.emailCalls[0].userId, "bobbi");
});
test("backup is notified only after delay and while unhandled", async () => {
  for (const workflow of ["new", "assigned", "in_progress"]) {
    const x = setup({ old: true, workflow });
    await publishVoicemailToFlow(x.db, input);
    assert.equal(
      x.tables.notifications.length,
      workflow === "in_progress" ? 1 : 2,
    );
    assert.ok(x.emailCalls.every((c) => c.organizationId === "org"));
  }
});
test("linked/completed messages stop follow-up alerts", async () => {
  for (const args of [{ linked: true }, { workflow: "completed" }]) {
    const x = setup(args);
    await publishVoicemailToFlow(x.db, input);
    assert.equal(x.tables.notifications.length, 0);
    assert.equal(x.emailCalls.length, 0);
  }
});
test("disabled owner falls back to active same-tenant admin", async () => {
  const x = setup({ disabled: true });
  await publishVoicemailToFlow(x.db, input);
  assert.equal(x.tables.notifications.length, 1);
  assert.equal(x.tables.notifications[0].user_id, "josh");
});
test("unclassified review reaches tenant admin; quarantine produces no alerts", async () => {
  const x = setup();
  await publishVoicemailToFlow(x.db, {
    ...input,
    department: null,
    state: "review",
  });
  assert.equal(x.tables.notifications[0].user_id, "josh");
  const y = setup();
  await publishVoicemailToFlow(y.db, { ...input, state: "quarantined" });
  assert.equal(y.tables.flow_events.length, 0);
});
