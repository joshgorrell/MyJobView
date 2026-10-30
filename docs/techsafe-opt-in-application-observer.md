# Opt-in observer around the existing application function

## Change under review

This is a backend change to the existing public.apply_change_order function. It preserves the original business statements, signature, owner, privileges, search_path, return type and error behavior, while surrounding the equipment application with the #385 observation helpers. It does not replace approval routing, tax/billing logic, source line identity or any dealer screen. It does not add a source trigger or route through the unused managed engine.

A separate private organization-level control defaults off. No controls, connections or pilot activations are seeded. Even with a connected active integration, the observer is skipped until that independent control is enabled. The new migration itself is not a production deployment or activation.

This is the narrow instrumentation tradeoff identified in #384 and documented before attachment in #385. A completely external read-only worker cannot recover a missing application success record. The previous error-propagating removal/restoration hooks remain detached, and #382's replacement finalizer remains withdrawn. The new observer contains its own ordinary failures and must never require a source action to be repaired or replayed for Techsafe.

## Execution and failure boundary

The original function first loads the CO, checks approved status and resolves the linked proposal. A marked block then checks the private organization control and optionally begins an observation. The original application statements run unchanged, including all existing totals behavior and existing source ambiguities. After those statements return successfully, a second marked block optionally completes the observation.

Each instrumentation block has its own EXCEPTION WHEN OTHERS boundary. An error reading the control table, invoking a missing helper, or recording evidence does not add an ordinary error to the source save. The original application/calculation remains outside these exception boundaries: its failures still propagate and roll back the source transaction and evidence. A failed finish leaves incomplete evidence, never a current quote. No remote request or worker delivery runs inside the transaction.

This does not swallow query cancellation, assertion failures, transaction/session termination or guarantee zero latency. Every call gains a private control lookup. When enabled, the existing bounded observation read sets and private writes add database work. Do not deploy or enable a pilot until full-schema function compatibility, query plans, load, contention, cancellation and multi-session behavior are verified. Ordinary failure isolation is not proof that added database work can have no effect.

The migration refuses unexpected function shape/execution model or obsolete hook variants. It strips its own three marked sections and compares normalized business text with the original before replacing the function definition. Tests additionally compare the full restored definition and security attributes. Future migrations replacing the public function must preserve/review this instrumentation deliberately; deployment monitoring must detect a dropped hook and withhold Techsafe verification.

## Security and current limits

application_observer_controls has RLS and no anon/authenticated privileges. There is no public control RPC or dealer-facing switch for this internal pilot control. A future authorized backend activation must first verify the connection and rollout requirements. It must not let browser clients grant themselves observer or export access. Private observation helpers retain their actor/tenant checks and no browser grants.

Source success is still governed by existing MJV permissions. The observer does not strengthen or weaken those policies or authorize source actions. Its records do not certify customer approval, intended equipment scope, duplicate-add semantics, historical baselines, all non-application changes or checkout freshness. No quote, receiver, worker or synchronization is enabled. The #386 assessment continues returning quoteReady=false in every state.

The unchanged legacy applier still merges identical additions and can replay old quantity updates. The observer intentionally does not fix those behaviors under the integration scope. Missing or contradictory evidence affects Techsafe availability, not the dealer's normal MJV workflow. Rejection, unlock, delete, transfer and snapshot-restoration handling, complete history validation and current customer/catalog/config inputs remain separate verification work.

## Validation and rollback

Run node tests/techsafe/application-observer-hook.mjs. The cumulative isolated PostgreSQL test verifies:

- Empty controls mean observation stays off despite an active connection.
- Enabling a control records an actual call to the original public applier (the test-only wrapper is not used for these calls).
- Original business function text/security attributes are preserved.
- Forced begin/finish failures, missing begin/finish helpers and a missing control table leave original equipment saves successful.
- Original calculation/status failures still propagate; source and evidence roll back together.
- Paused connections and disabled controls do not prevent equipment saving or create evidence.
- Existing add/remove/quantity/price/labor/modifier branches and identical-add semantics remain unchanged, browser roles cannot control rollout and no source integration triggers are installed.

This fixture is minimal and does not replace full-schema or multi-session validation. Earlier tests intentionally exercise earlier migration states; this new test covers the final attached-but-off-by-default state. Before pilot activation, add full-schema cases for every application branch, taxes, modifiers, caller authorization and financial triggers. No production database is modified by this PR.

Operational rollback after a pilot begins starts by disabling its private control, stopping verification/publishing and retaining evidence. To remove all lookup overhead, a reviewed migration can strip only the marked observer sections after checking no later business changes would be lost. Do not restore an old entire function definition over newer MJV business logic, erase evidence or replay source applications.
