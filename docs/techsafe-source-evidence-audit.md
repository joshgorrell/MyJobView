# Read-only source application evidence audit

Reviewed October 30, 2026. Source repository baseline: MyJobView 533807455df140143e816a9e8bc69146ef281cf4 (#383). Techsafe #22 is merged at 001413f6833420cca69d55129f25254e6264428c.

## Result

No reliable existing marker was found that certifies complete, successful equipment application for every approved CO. Approval, is_active, locking, matching prices/quantities and a quiet interval cannot substitute for that evidence. The current read-only integration cannot yet promise an automatically verified current quote for all order histories. Leave synchronization and checkout disabled until that gap is resolved; do not claim these tests solve it.

This PR adds regression tests and documentation only. It does not fix, replace or invoke production source workflows. All mutations in the tests occur in a disposable isolated PostgreSQL instance.

## Verified observations

Read-only schema inspection found proposal_line_items as the linked proposal equipment source; it did not find a separate public sales_order_line_items table. change_order_line_items has proposal_line_item_id, but the existing addition branch does not persist its generated proposal-line identity back to the source row. The full public apply/reject/unlock/transfer/snapshot functions were inspected read-only. The connected database currently has no techsafe_source schema, no replacement finalize_managed_change_order public function and no Techsafe change-order triggers. Repository merges have not activated these source foundations in that database.

| Finding | Evidence | Consequence for sync |
| --- | --- | --- |
| Approved header can exist before equipment application | Both ChangeOrderApprovalFlowModal.handleManualApprove and ChangeOrderApprovalModal.finalizeApproval save approved status before a separate apply_change_order request | Never mark a quote current from approved status, locked state or is_active=false alone |
| Identical additions are deduplicated by business values | apply_change_order matches product_id, description, unit_price and quantity instead of source identity | Two legitimate additions can correspond to one proposal row; do not manufacture a one-to-one mapping or replay source changes |
| Old application retries can overwrite newer values | modify_quantity/modify_price update targets every time; no durable idempotency receipt exists in the legacy path | Sync must be strictly read-only; it must never repair or replay the source applier |
| Rejection can restore a line another approved CO removed | reject_change_order unhides every referenced remove target without evaluating other approved removals | Hidden state and approved removal history can disagree; withhold certification rather than guess |
| Unlock changes approval state without reverting equipment | unlock_change_order sets draft/unlocked, clears approval fields/steps and writes history; it does not reverse applied equipment | A draft CO is not proof its changes are absent from current scope |
| Snapshot restoration is broader than a line delta | revert_proposal_from_snapshot deletes/upserts rooms/items and restores visibility | Source deletions and restored identities require complete reconciliation |
| Snapshot capture is not a complete equipment receipt | capture_proposal_snapshot aggregates lines through proposal_rooms and stores selected fields | Unassigned lines and omitted fields must not be silently certified from that snapshot alone |
| Transfer is a distinct source operation | transfer_change_order_to_proposal restores remove targets, creates a separate proposal and marks transferred | Do not merge transferred draft equipment into the original order without verified binding |

The first four findings are executable regressions in tests/techsafe/source-evidence-regressions.mjs. They reproduce existing behavior after all source integration migrations through #383, compare restored public applier/rejector definitions to their baseline, and assert no managed registrations or application/removal receipts are created.

## Safe implementation boundary

The worker can read the actual committed proposal rows, full CO history, bindings, product exclusions and catalog semantics in a consistent snapshot. It can identify contradictions and withhold Techsafe certification. It cannot infer missing application identities or recover a failed application merely by polling twice. A source content hash detects changes; it is not proof of approval or successful application. A worker may only promote a draft to current once a separately validated evidence strategy covers that complete history.

The existing MJV workflow must continue unchanged when Techsafe is unavailable or evidence is missing. Do not reintroduce the withdrawn replacement finalizer, managed registrations or legacy-path blocks. Do not change source quantities, deduplicate source lines, reverse removals or repair application retries as part of synchronization. Potential MJV defects belong in a separate scoped change with their own review and behavioral tests.

Before implementing the reader, define and review the evidence strategy against these counterexamples. Candidates must preserve the source workflow and distinguish actual applied scope from requested scope. If durable evidence cannot be obtained without narrowly scoped source instrumentation, document that tradeoff explicitly before implementing it; do not silently label stable observations as verified. Missing evidence must affect Techsafe availability, never normal MJV operations.

After resolving evidence, implement bounded scoped source reads, complete snapshot projection, source revisions in integration-owned storage, idempotent receiver persistence, automatic reconciliation and checkout freshness checks. Customer-name transport and source product opt-out resolution still need an adapter. Polling cannot by itself eliminate the source-verification-to-payment race; that protocol remains a separate activation requirement.

## Validation and limits

Run node tests/techsafe/source-evidence-regressions.mjs and node tests/techsafe/workflow-isolation.mjs. These use a minimal PostgreSQL fixture with the repository baseline applier and representative reject function. They do not exercise the full deployed schema, every portal caller, financial triggers, RLS, multiple database sessions, network transport or payment behavior. The read-only inspection confirms function logic, not an exhaustive production history audit. No customer records or credentials are committed here.
