# Server-only sandbox send

`techsafe-run-sandbox-check` provides a privileged operator path to exercise the
existing native sender without a browser session or exporting service/receiver
credentials. It always composes the sender with `environment:'sandbox'` and is
disabled unless the existing sender flag is enabled and its environment is
explicitly sandbox. The ordinary dealer-admin JWT sender is unchanged.

The endpoint uses a custom one-use capability, not Supabase JWT authentication.
`verify_jwt=false` permits the request to reach the handler; the handler requires
a cryptographically random 64-character lowercase hex token whose SHA-256 hash
matches a private SQL-issued ticket. There is no public ticket-issuance RPC,
browser grant or new reusable secret. API roles cannot read or issue tickets.

A ticket must have `purpose='sandbox_send'`, an exact connection/order binding,
the current connection generation, an issue time in the past, expiry no more
than five minutes after issuance, and no consumption time. The connection must
be enabled and active. Atomic UPDATE consumes the ticket once before any native
send. All SQL sessions are returned before invoking the sender. Concurrent
requests cannot both consume it. Native rejection consumes the ticket too;
retry requires a new ticket and still uses the native stable export event.

The ticket authorizes invocation only. Native prospective approval, source
freshness, the immutable completion clock, certificate persistence, immediate
delivery recheck, receiver credentials and receiver environment binding remain
required. No completion evidence is fabricated and no quote, charge, payment or
coverage is created by this endpoint. Responses contain a bounded reason and
revision only. It accepts neither endpoint nor credentials nor source payload.

Deploy after the reviewed ticket-scope migration; preexisting unscoped tickets
remain NULL-purpose and cannot invoke it. Deploy this separate function with
custom authentication (`verify_jwt=false`), preserving `verify_jwt=true` on the
ordinary sender. Neither deployment activates a source/receiver connection.

For a live smoke test, a privileged SQL operator should first verify the
dedicated sandbox connection and a fresh natively approved test order. Generate
a random token in the database, insert its hash and exact scope with a two-minute
expiry, then send the token directly through a server HTTP request (for example
pg_net). Never return the raw token, receiver credentials or service key in SQL
results, application logs, source control or user-facing instructions. Inspect
only the bounded HTTP outcome, source certificate and receiver receipt/draft
identity. This repository batch does not claim a successful live import.

The ticket table is private integration provenance linked to the connection,
not an activity record; it has no Flow, notification, note or attachment
children. Existing connection deletion restrictions and native order deletion
semantics remain unchanged. Expired/consumed ticket retention is operator-owned;
the endpoint does not delete independent records or provision schedules.
