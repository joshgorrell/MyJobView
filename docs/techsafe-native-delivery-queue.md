# Native delivery queue and retries

This is a transactional outbox around the existing native Techsafe sender. It
does not apply change orders, rebuild equipment, generate approval evidence,
calculate prices or enable checkout.

Native source events coalesce into one private queue row per connection. The
row holds source identities and a local dirty sequence, never customer or
equipment payloads. Relevant order/proposal/line, change-order/commit, customer
name, catalog metadata and connection changes mark the row dirty in the source
transaction. Both sides of a mutable ownership change are considered. A rollback
rolls back its queue event. No row trigger makes an HTTP request.

The separate minute scheduler harvests prior HTTP outcomes and claims at most
ten due active connections for one explicitly configured environment. An
advisory transaction lock excludes overlapping schedulers, and connection row
locks use SKIP LOCKED. It issues a two-minute, single-use capability bound to the
connection, order, generation, environment and attempted dirty sequence, then
enqueues HTTP through pg_net. pg_net sends only after that transaction commits.

The dispatcher validates the capability against the still-active connection,
enabled scheduler configuration and unexpired queue lease, releases its SQL
session, and calls the existing native sender. The ordinary JWT sender and
sandbox-only runner retain their authentication. Dispatch capabilities cannot
be used as sandbox-runner capabilities or cross environments. Requests cannot
supply endpoints, credentials, source evidence, prices or decision flags.

## Acknowledgment and retry

Only a successful worker response containing accepted=true and the native
sender's verified source revision acknowledges an attempted sequence. Native
receipt matching still happens inside the sender. Non-2xx, malformed responses,
missing revisions, source holds, credential errors and transport failure remain
unacknowledged. Missing pg_net responses recover after the lease expires.

An acknowledgment advances only its attempted sequence. Changes arriving while
HTTP is in flight remain dirty and schedule another send. Failures retry after
one minute with exponential backoff capped at one hour; fresh source changes
reset that delay. This is at-least-once delivery. The native sender persists its
stable revision/event, and the receiver rejects older revisions and handles
duplicates. The queue never replays native change-order application.

## Opt-in rollout

Apply the queue migration, then scheduler migration, and deploy all three source
entrypoints from the matching source graph. Existing pg_net and pg_cron
extensions are prerequisites. The scheduled job is installed, but cannot send
anything by default: settings.enabled=false, worker_url=NULL and existing
connection dispatch_environment values are NULL. No connection or generation is
adopted, backfilled or activated by migration.

After verifying the sandbox credential and first import, classify the dedicated
sandbox connection's dispatch_environment, set the private settings environment
and fixed worker URL, then enable it and inspect a queued attempt and verified
acknowledgment. The only allowed URL is this MJV project's
/functions/v1/techsafe-dispatch-order endpoint. Production requires its own
explicit environment classification, active connection and matching server
configuration. No new reusable secret or browser session is required.

Disabling private settings stops new claims and denies issued worker capabilities.
Pausing/revoking a connection or rotating its generation invalidates its pending
capabilities too. Queue storage persists for reconciliation. Manual private
reconciliation may mark the source dirty or move next_attempt_at forward after
a configuration repair; it must never fabricate an acknowledgment.

Queue/storage failures roll back their source write. Network, credentials and
receiver outages occur outside the native business transaction and only affect
delivery/backoff. SQL sessions are not held across HTTP round trips. Event
capture, due and in-flight lookups use scoped/partial indexes and bounded batches.

## Ownership and limits

Queue rows are exclusively owned by the private connection and cascade on its
permitted deletion. Their composite FK preserves exact organization/order/
proposal scope. There is no new FK to the native Sales Order: permitted order
deletion still succeeds, retains its native deletion tombstone and queues the
negative source event. Existing connection/history restrictions remain in place.
Rollback and tenant-scoped cleanup preserve independent native orders and
proposals. Queue/settings/tickets have no Flow, notification, note, attachment or
external-copy children. The singleton scheduler/settings are operational records,
not children of a customer or order. Capability retention remains operator-owned.

All queue/configuration tables force RLS and deny API-role access. Helpers are
private with fixed empty search paths and revoked API EXECUTE privileges. The
worker is verify_jwt=false solely for its own scoped one-use authentication;
the main sender stays verify_jwt=true.

This queue does not establish synchronous source freshness for payments. Existing
native source/hold checks remain authoritative, and unverified source errors
stay queued. Live authoritative quote/payment-order schema, processor settlement
and first successful cross-project import remain separate completion gates.

## Verification

The isolated fixture applies the actual queue/deletion/scheduler migrations and
dispatcher handler on PGlite and PostgreSQL 16. It checks default-off behavior,
transaction rollback, coalescing, stale acknowledgments, one-use/environment and
generation denial, paused/disabled controls, failure backoff, malformed or
incomplete HTTP success, missing-response recovery, concurrent scheduler
exclusion, scoped catalog/customer events, permitted order deletion and owned
queue cleanup/rollback. Its pg_net/cron endpoints are fixture transports; it
does not claim a live import, production cryptographic or payment verification.
