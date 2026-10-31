# Original equipment evidence audit and portal candidate

Techsafe will receive one current equipment list per MJV sales order. Approval/change history stays private to MJV verification. This step audits an existing source of original approval-time rows and adds a read-only private candidate reader. It does not authorize a quote or change an MJV workflow.

## Findings

| Source | What the audit found | Integration consequence |
| --- | --- | --- |
| Customer portal decision | `submit_customer_proposal_decision` captures all proposal items, rooms, settings and proposal state before approval, then writes the result and evidence to `private.proposal_customer_decisions` in the same transaction | Existing evidence can supply a strictly bound approval-row candidate without introducing an approval hook |
| Room-based proposal snapshot | `capture_proposal_snapshot` aggregates items through proposal rooms and omits the customer-supplied field | It cannot establish the complete original equipment row set; unassigned items and missing semantics must not be guessed |
| Manual approval screens | `ManualApprovalModal` and `ApprovalActionModal` update proposal approval fields; the unified approval trigger creates the order/project/billing records, without writing the customer decision snapshot | Staff/manual approvals do not automatically qualify for this portal candidate path |
| Current proposal items / order totals | Rows can change after approval and a money total does not identify equipment | Do not backfill a historical original row set from current rows or totals |

Read-only native catalog checks on October 31, 2026 matched the captured definitions for these relevant routines. No customer/approval records were queried in production, and no production changes were made.

| Routine | SHA-256 of native `pg_get_functiondef` |
| --- | --- |
| `submit_customer_proposal_decision(uuid,integer,uuid,text,jsonb)` | `290ce94add8cde9dfc32cafb93b8d6d5abfe0ce7f675a38325574034798db6a7` |
| `handle_unified_proposal_approval()` | `6ab77885fbd93632925f45c4fc5a9d12221e6bfb80bc6ec388e02899c3bbcf39` |
| `capture_proposal_snapshot(uuid)` | `3bb06c1d8591e130ee9c5eab0bd5f095fce721dc2b7623d0fa3d2780a4e7c7a2` |

These hashes document the inspected implementation. They are not persisted signatures authenticating every historical receipt, and this change does not add an immutability guard to source receipts.

## New private reader

`techsafe_source.read_portal_approval_equipment_basis(connection, order)` is STABLE, invoker-only, with an empty search path and no PUBLIC/anon/authenticated/service_role execute privilege. It uses the existing current order reader's tenant, actor, connection-health and size gates. It adds no table, source trigger, source-function replacement, approval/deposit/billing changes, control enablement or caller.

The reader requires exactly one approval receipt among at most 1,000 decision headers for the proposal. Its result must identify this order; its viewer, method and version must match the current approved proposal. The receipt creation time must equal the order creation time and both current approval timestamps. The captured proposal must match the tenant, proposal and customer, be an active sent/viewed/portal revision, and have no pre-existing sales-order link. Reapprovals, reused orders, ambiguous receipts, changed approvals, missing evidence and unsupported/manual paths return null. No first/last-record preference is used.

Every captured item must retain a unique valid source identity, tenant/proposal binding, product identity or explicit null, existing classification, numeric quantity/price, supplied/hidden booleans and bounded description. All original items are considered directly, including unassigned-room items. The output projects only the established equipment evidence fields, plus the captured unit price as a decimal string. It excludes cost, retail price, customer contact fields, source notes, rooms, display data, settings, purchase-order details and viewer identity. Existing source JSON may contain those fields; they are not exported or used to price equipment.

The full source evidence is capped at 4 MiB before item expansion, the item count at 10,000, and the projected equipment rows at 1 MiB. Overflow or malformed data makes the whole candidate unavailable. The existing `(proposal_id, request_id)` primary key supports scoped decision/header and receipt lookup. No source index is changed.

The candidate includes an equipment-row digest using the existing private equipment projection. This is a diagnostic hash, not a receiver snapshot hash, proof of receipt immutability or quote authorization. Historical quantities/prices remain approval-time values even after current source rows change.

## Remaining work

An approved-row candidate is not yet a complete determination of initial sold membership or final net equipment prices. It does not infer membership from hidden state, fill missing historical fields or promote raw unit prices to resolved selling prices. `originalScopeVerified`, `scopeVerified`, `snapshotReady` and `quoteReady` remain false.

The next verifier must compare a validated original basis with the first observed application/current rows, apply an audited initial membership policy, and combine the complete observed history with current eligibility and resolved selling prices. Orders with no changes also need this original-basis path; an empty change history alone is not proof. Manual approvals need a separately reviewed evidence strategy that preserves their existing workflow. Native authorization/provenance, concurrency, performance, checkout freshness and activation gates remain open. No live transport or dealer-facing history is introduced.

## Validation

`node tests/techsafe/private-order-source.mjs --equipment-evidence --equipment-pairs --portal-basis` runs existing reader/observation safeguards and the new portal candidate tests. Cases cover no-receipt/manual headers, original values after current edits, unassigned rows, privacy projection, timezone stability, approval/version/approver/order/customer mismatches, existing-order/reapproval evidence, foreign/malformed/duplicate items, ambiguous approvals, byte/count limits, unhealthy connections, denied API roles and read-only behavior.

The optional privately captured schema run adds the capture directory as the first argument. It compiles the new reader against reconstructed source tables, checks unavailable/no-connection results and confirms no connection was seeded. It does not execute the outbound portal approval function or certify real Auth/native approval behavior. Raw captures and runtime receipt dumps are not committed. Existing effect, continuity and application-evidence tests are also run.
