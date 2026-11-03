# Rewards audit and implementation — October 22, 2026

PR #261 integrates main through merged Sales Dashboard PR #250 (e88a3c37).
The audit inspected repository producers and the installed MJV database routines,
triggers, grants, policies and table definitions. Earlier notes describing this
as documentation-only are superseded by this implementation.

## Effective producer inventory

| Activity | Implemented source and award |
| --- | --- |
| Regular assignment | `complete_task_atomic`; first eligible individual/department resolver; assignment value, including explicit zero |
| Fishbowl task/question | `set_discussion_task_completion`; actual audience and assignment authorization; task value or company question value |
| Assignment reopening | Creator/admin only; reverses the actual outstanding ledger award, even if assignment value changed; a new completion has a new event identity |
| Contact / connection | Source-row triggers; company's contact/connection configuration |
| Lead created / claimed / converted | Source-row triggers; company configuration; each event once per lead |
| Public general Fishbowl post | Original public general posts only; no replies, private posts, tasks or questions; correct `user_id` attribution |
| Job photo/video | Source-row insert trigger; company's upload value, attributed to uploader; removes separate browser award RPC |
| Daily attendance | Existing schedule/PTO/holiday/offline correction workflow retained: early +10, on-time +5, late -5, very late -10 |
| Forgotten daily clock-out | Existing scheduled service job; company-configured penalty; scoped entries/recipients and no pre-reset test-entry penalties |
| Manual time correction | Existing authorized correction trigger; company loss amount; ledger applies balance delta once |
| Same-day PTO call-in | Existing company cutoff/timezone and exempt leave checks; ledger applies loss once |
| Redemption | Atomic profile/reward locks; company and module authorization; cost snapshot, request identity, stock and signed debit in one transaction |
| Cancellation | Authorized admin status RPC; one exact refund and stock return; fulfilled requests cannot cancel |
| Admin correction | `adjust_reward_points`; active company admin, another employee, amount, reason and retry identity required |

Assignment creators receive zero points for completing their own assignments.
Employee-provided amounts cannot write the ledger or modify profile balances.
Replays of a lead claim/conversion do not farm additional awards. Configuration
zeroes disable fixed-value activities in the employee menu.

No active producer was verified for proposal approval, customer reviews,
referrals, ordinary job notes, callbacks or punchlist completion. Legacy job-note
and daily-note routines have no installed awarding triggers. This change does
not invent award values or attribution policies for those activities. Ordinary
job clock-in/out is not an additional reward. These remain policy/implementation
follow-ups rather than advertised earning activities.

## Security and accounting changes

The live database allowed arbitrary authenticated calls to `award_points`, client
ledger writes, profile balance edits, global `LIMIT 1` configuration selection,
and broken public-post attribution. The follow-up migration replaces browser
writers with authenticated, active-employee, tenant-scoped RPCs/triggers. Private
posting helpers are not executable by browsers. Catalog/configuration writes
require company admins; history reads are own-or-admin. Direct ledger/redemption
table and column write grants are revoked. Profile increments use serialized
row updates rather than concurrent ledger SUM snapshots.

Rewards shown in Earn Points come from the server's current company settings,
not four hard-coded UI values. Balances are refreshed from the database.
Redemption request IDs survive same-tab page reload after an ambiguous response.
Admin errors are checked. Removing a catalog item archives it, retaining prior
redemption history.

The existing scheduled auto-clock-out entrypoint still chooses one company's
settings per invocation; this patch scopes all processed records, recipients and
settings updates to that company. A multi-company scheduler interface is a
separate operational follow-up. Trusted service-role jobs retain compatibility
with `award_points`; browsers cannot call it.

## Authorized test reset

Josh explicitly authorized historical balances/history to be cleared because
they were test data. `20261022171746_reset_elife_test_rewards.sql` resolves the
Electronic Life organization by subdomain, locks its profiles, records a reset
cutover, clears its redemption requests/current and legacy reward ledgers and
sets its balances to zero. Other companies and work records are retained.
Catalog stock is retained as configured, without inventing a historical stock
baseline. Old attendance and forgotten-clock-out entries cannot replay points.
This migration must be applied once; migration history is the rollout guard.
Legacy redemptions in other companies require debit reconciliation before
cancellation and refund; ambiguous old debits are never guessed.

## Verification and release gates

- `npm run typecheck` and `npm run build`.
- `npm run test:rewards`: executable PostgreSQL fixture, direct/column grant
  denial, active/portal/anonymous/admin/tenant/module authorization, real
  department-access helper, first resolver, explicit zero, questions, self-task
  zero award, exact reversals, cancellation/refund, fulfillment, source events,
  disabled values, manual/PTO deductions, scoped reset and scheduled clock-out.
- `npm run test:rewards:browser`: actual Rewards component at 320, 390, 768 and
  1440 pixels, both theme contexts; current balance/menu, history, errors/retry
  and reload-safe redemption identity.
- Existing `npm run test:flow` and `npm run test:employee-time` regressions.
- `Rewards integrity` CI repeats build/typecheck and SQL tests against a real
  PostgreSQL 17 service, then uses separate connections to race last stock,
  shared balance, identical request IDs and first task completion. Injected
  ledger failure must roll back balance, stock and redemption together.
- Merge only the reviewed latest head after its checks succeed, no review
  blockers remain, current main is integrated, and rollout is verified.

Local SQL execution uses PGlite. It is not evidence of multi-session concurrency;
that gate is explicitly assigned to real PostgreSQL CI. Production rollout and
latest-head CI status must be recorded separately from these test descriptions.
