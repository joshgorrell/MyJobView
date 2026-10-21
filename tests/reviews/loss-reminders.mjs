import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL(
    "../../supabase/functions/send-review-followup-job/lostFeedback.ts",
    import.meta.url,
  ),
  "utf8",
);
const { sendLostFeedbackReminders, lostFeedbackEmail } = await import(
  "data:text/javascript;base64," +
    Buffer.from(
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ES2022,
        },
      }).outputText,
    ).toString("base64")
);
const now = new Date("2026-10-20T12:00:00Z"),
  settings = {
    company_name: "Electronic Life",
    from_address: "Electronic Life <test@example.com>",
    reply_to_email: "owner@example.com",
    subdomain: "elife",
  },
  org = {
    organization_id: "org1",
    lost_review_followup_enabled: true,
    lost_review_followup_days: 7,
  };
let tables,
  emails = [],
  fail = false;
function reset() {
  emails = [];
  fail = false;
  tables = {
    lost_review_details: [],
    lost_review_tokens: [],
    proposals: [],
    proposal_loss_feedback: [],
  };
}
function add(id, overrides = {}) {
  const row = {
    request_id: id,
    organization_id: "org1",
    proposal_id: null,
    auto_followup_enabled: true,
    delivery_status: "sent",
    responded_at: null,
    follow_up_sent_at: null,
    followup_claimed_at: null,
    opportunity_name: "Home theater",
    title: "Our quote",
    review_requests: {
      sent_at: "2026-10-12T12:00:00Z",
      recipient_name: "Test",
      recipient_email: "customer@example.com",
    },
    ...overrides,
  };
  tables.lost_review_details.push(row);
  tables.lost_review_tokens.push({
    request_id: id,
    token_hash: "original-hash",
    expires_at: "2027-01-01",
  });
  return row;
}
const db = {
  from(table) {
    let filters = [],
      changes,
      one = false,
      max = Infinity;
    const q = {
      select: () => q,
      eq: (k, v) => {
        filters.push((r) => r[k] === v);
        return q;
      },
      is: (k, v) => {
        filters.push((r) => (r[k] ?? null) === v);
        return q;
      },
      gt: (k, v) => {
        filters.push((r) => r[k] > v);
        return q;
      },
      in: (k, v) => {
        filters.push((r) => v.includes(r[k]));
        return q;
      },
      or: (text) => {
        const cutoff = text.split(".lt.")[1];
        filters.push(
          (r) =>
            r.followup_claimed_at == null || r.followup_claimed_at < cutoff,
        );
        return q;
      },
      update: (v) => {
        changes = v;
        return q;
      },
      limit: (n) => {
        max = n;
        return q;
      },
      single: () => {
        one = true;
        return q;
      },
      maybeSingle: () => {
        one = true;
        return q;
      },
      then(resolve, reject) {
        return Promise.resolve()
          .then(() => {
            let result = tables[table]
              .filter((r) => filters.every((f) => f(r)))
              .slice(0, max);
            if (changes) for (const r of result) Object.assign(r, changes);
            return {
              data: one
                ? result[0]
                  ? structuredClone(result[0])
                  : null
                : structuredClone(result),
              error: null,
            };
          })
          .then(resolve, reject);
      },
    };
    return q;
  },
};
const send = async (init) => {
  emails.push(init);
  return new Response("{}", { status: fail ? 502 : 200 });
};
reset();
const due = add("due");
add("answered", { responded_at: "2026-10-15" });
add("sent", { follow_up_sent_at: "2026-10-19" });
add("disabled", { auto_followup_enabled: false });
add("failed", { delivery_status: "failed" });
add("other-org", { organization_id: "org2" });
add("fresh", {
  review_requests: { ...due.review_requests, sent_at: "2026-10-19T12:00:00Z" },
});
add("missing-date", {
  review_requests: { ...due.review_requests, sent_at: null },
});
assert.deepEqual(
  await sendLostFeedbackReminders(db, send, settings, org, "test-secret", now),
  { sent: 1, errors: 0 },
);
assert.equal(emails.length, 1);
const message = JSON.parse(emails[0].body);
assert.match(message.html, /Tell Us Why/);
assert.match(
  message.html,
  /https:\/\/elife.myjobview.com\/lost-opportunity-review\?token=/,
);
assert.equal(message.to, "customer@example.com");
assert.equal(emails[0].headers["Idempotency-Key"], "lost-feedback-due");
assert.equal(tables.lost_review_tokens[0].token_hash, "original-hash");
assert.ok(tables.lost_review_tokens[0].followup_token_hash);
assert.equal(due.followup_claimed_at, null);
assert.deepEqual(
  await sendLostFeedbackReminders(db, send, settings, org, "test-secret", now),
  { sent: 0, errors: 0 },
);
reset();
add("manual", { proposal_id: "p1" });
add("portal", { proposal_id: "p2" });
add("assessment", { proposal_id: "p3" });
add("won", { proposal_id: "p4" });
tables.proposals = [
  { id: "p1", organization_id: "org1", status: "declined" },
  {
    id: "p2",
    organization_id: "org1",
    status: "declined",
    declined_by: "customer",
    decline_reason: "price_too_high",
  },
  { id: "p3", organization_id: "org1", status: "declined" },
  { id: "p4", organization_id: "org1", status: "approved" },
];
tables.proposal_loss_feedback = [
  { id: "m1", proposal_id: "p1", organization_id: "org1", source: "phone" },
  {
    id: "m2",
    proposal_id: "p3",
    organization_id: "org1",
    source: "staff_assessment",
  },
];
assert.deepEqual(
  await sendLostFeedbackReminders(db, send, settings, org, "secret", now),
  { sent: 1, errors: 0 },
);
reset();
add("race");
const results = await Promise.all([
  sendLostFeedbackReminders(db, send, settings, org, "secret", now),
  sendLostFeedbackReminders(db, send, settings, org, "secret", now),
]);
assert.equal(
  results.reduce((n, r) => n + r.sent, 0),
  1,
);
assert.equal(emails.length, 1);
reset();
const retry = add("retry");
fail = true;
const log = console.error;
console.error = () => {};
try {
  assert.equal(
    (await sendLostFeedbackReminders(db, send, settings, org, "secret", now))
      .errors,
    1,
  );
} finally {
  console.error = log;
}
assert.equal(retry.follow_up_sent_at, null);
assert.equal(retry.followup_claimed_at, null);
fail = false;
assert.equal(
  (await sendLostFeedbackReminders(db, send, settings, org, "secret", now))
    .sent,
  1,
);
assert.equal(emails[0].body, emails[1].body);
reset();
add("off");
await sendLostFeedbackReminders(
  db,
  send,
  settings,
  { ...org, lost_review_followup_enabled: false },
  "secret",
  now,
);
assert.equal(emails.length, 0);
assert.ok(
  !lostFeedbackEmail(
    "<script>alert(1)</script>",
    "A&B",
    "<b>quote</b>",
    'https://example.com/?x="',
  ).includes("<script>"),
);
console.log(
  "Seven-day reminder eligibility, links, original-token preservation, tenant isolation, manual feedback suppression, concurrent claims and delivery retries passed.",
);
