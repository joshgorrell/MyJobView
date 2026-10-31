# Captured-source sales-order comparison

The first captured-source business comparison now runs the original public change
applier and rejector against the reconstructed application schema, then repeats the
same synthetic actions after applying the reviewed, cumulative Techsafe migrations
and enabling the observer locally. Migration #382 is excluded; the managed engine
is not registered or used. No production migration or activation occurs.

## Results

Thirteen sequential cases matched between baseline and observer runs for SQLSTATE,
equipment values/visibility, change-order status/activity, proposal parts/labor/
subtotal/tax/total/deposit amounts and sales-order contract total:

- Quantity, price, labor and removal changes; an equipment addition; further
  quantity/price changes; and the modifier application branch.
- Reapplying an old quantity change and rejecting the prior removal.
- Forced observer-finish failure, forced observer-begin failure and a missing
  observer control table. The baseline performs the corresponding original RPCs.

Twelve calls succeeded in each run. The material ADD call failed with `23514` in
both runs because the original applier does not supply cost, leaving the source's
zero default, which `proposal_line_items_cost_positive` rejects for an ordinary
non-customer-supplied product. This is a reproduced source interaction, not an
observer regression. The approved header remains while the application rolls back.
No cost guard, applier statement or product classification was changed to make the
test pass. The CI evidence regression separately retains this approved-but-failed
case. A read-only metadata preflight confirmed that the current source applier,
guard, defaults and all proposal-line trigger/function hashes match the capture.
No live customer scenario was executed. Review the source issue separately before
automatic quote activation; this PR does not fix MJV business behavior.

The retry case also preserves the known source behavior where an older quantity
change overwrites a newer quantity. Matching baseline behavior is **not** proof
that the resulting equipment matches intended approved history. The integration
must not replay source RPCs or treat approved headers as application certificates.

The observer run retained nine observations: eight completed and one incomplete
after the forced finish error. The incomplete assessment returned
`incomplete_observation` and `quoteReady=false`. Begin/control failures did not
prevent the original source operation. The failed ADD rolled back its observation.
Assertions require the specific success/error sequence and observation counts;
equal-but-unexpected failures cannot silently pass the comparison.

## Permissions and triggers

The local privilege stage restores the captured application schema/object/column
privilege sets and grant options for reviewed roles only. It compares 1,208
successfully restored objects and 6,222 column privilege sets with zero mismatches.
The decoder recognizes PostgreSQL table, sequence, routine, type and schema ACL
letters, handles explicit PUBLIC and grant options, and rejects unknown roles or
letters. Objects restore within savepoints. Null ACLs mean native defaults for
objects; null column ACLs mean no explicit column grants. Column resets prevent
stale fixture grants from broadening access. ACL-array/OID order is not significant.
Grantor semantics, default privileges and provider role behavior are unverified.

The six deliberately deferred outbound-pattern routines remain absent, so their
ACL restore attempts are explicitly reported as `42883`. One trigger,
`public.messages.on_customer_question_insert`, references a deferred routine and
cannot be installed. This is outside the seeded case's customer-question path;
notifications, customer questions and portal submission are not certified.

Of 375 captured application triggers, 374 installed with exact native definitions.
They were immediately disabled in the same transaction, with source enable states
retained separately. No trigger ran while synthetic fixture rows were seeded.
The private business harness then explicitly enabled all installed triggers to
their captured source states before exercising the RPCs. All are source state O.
Tax, contract-total, proposal-line, audit, task and sales-credit triggers remain
present; none were replaced with no-op implementations to obtain the comparison.
Only observer helpers are deliberately fault-injected in the observer-outage cases.
Source routine bodies are not stubbed or rewritten by the harness.

The generic CI suite checks exact table/column ACLs, schema/function access, grant
options, denied anonymous/column access, disabled trigger installation, explicit
enablement, calculated totals, audit effects and deferred constraint rollback.
The private captured-source suite additionally applies the real cumulative
Techsafe migrations, including their function drift guards, before comparing the
existing applier/rejector under the authenticated role.

## Reproduction and limits

Run `node tests/techsafe/privilege-trigger-layer.mjs` and
`node tests/techsafe/source-evidence-regressions.mjs` for CI's synthetic checks.
Run `node tests/techsafe/captured-sales-order-scenarios.mjs /reviewed/capture` for
the private captured-source comparison. Raw source definitions are not committed.
The shared fixture always constructs fresh in-memory PGlite databases; it has no
Supabase client, credentials or deployment path. Trusted catalog SQL can resolve
or evaluate expressions and must be privately reviewed before execution.

The fixture has no source rows, network extensions, jobs, production credentials
or real Auth service. Local API roles do not reproduce provider login/membership/
bypass behavior. Requests use synthetic claim settings and pre-approved fixture
headers seeded before triggers; this does not test normal proposal/customer
creation, real approval/portal routing or all source trigger side effects.
Financial comparisons use the fixture's zero tax rate and empty rule/config data;
they do not certify Kansas/Missouri tax scenarios, billing or commissions broadly.
PGlite is PostgreSQL 17.5; source metadata verification used 17.6.

Native full-service compatibility, complete source permissions/default ACLs,
approval/unlock/delete/transfer workflows, customer/config/catalog changes,
nonzero tax/modifier matrices, intended-history evidence, cancellation, load and
multi-session races remain pending. `fullWorkflowCertified`, `quoteReady` and
production writes remain false. Neither live website/database, migration history,
existing source workflow, observer control nor coverage was changed.
