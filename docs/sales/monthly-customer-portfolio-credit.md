# Monthly sales performance and competition

Performance credit is separate from funds-received commission, payments and customer account credits. This change never moves money, transfers a deposit, issues a refund or changes commission entries.

## Posting and attribution

- New committed project orders qualify at booking, including approved proposals awaiting a deposit or PO. Planning orders qualify when their proposal is subsequently approved.
- Orders use the customer's owning salesperson at first posting. This resolves the older document's conflicting order-rep/customer-owner descriptions in favor of the customer portfolio rule used by this feature.
- Contract totals are tax-inclusive. Posting removes the approved proposal's tax and the signed tax on approved billable change orders. Discounts and freight remain part of the before-tax sale.
- Standalone service/T&M/retail invoices qualify when finalized, at their actual posting time. The customer owner receives credit, never the dispatcher or invoice creator.
- Explicit sales-order/proposal/deposit/progress/final links and projects belonging to an order exclude duplicate project invoice credit. Mixed or unclassified sources need explicit source linkage before they qualify; labels are not used to guess missing project revenue.
- New security agreements and subscriptions snapshot their customer's sales owner when created. Existing agreements without a reviewed origin remain unassigned. The subscription schema's actual `created_by` field is not mistaken for `created_by_user_id`, and creators are not treated as originators.
- Recurring credit is earned only as billed. Linked subscription amounts allocate the actual before-tax invoice total with largest-remainder cent allocation. Late links, sequential transactions, changed allocations, voids and retries reconcile the whole invoice without duplicating credit.
- The initial source/customer/rep attribution is immutable. Changing a customer's assigned rep never rewrites prior sales. A posted source cannot be moved to another customer or organization.
- Price changes, approved change orders, cancellation, deletion and reinstatement append linked compensating entries. Repeating the same source state creates no event. Changes post in the adjustment month; the original dated entry remains intact.
- Standalone credit-note/refund documents are not invented as a second sale. Any future credit-memo/refund source needs a verified original-sale relationship before a new posting hook is added.

## Privacy and reporting

- `get_current_month_sales_competition()` accepts no historical date or target rep. It returns only active same-organization rep names, ranks, current-month amounts and a current-user flag. There are no other-rep customer/source IDs or historical totals in that payload.
- `get_sales_performance` checks the current user's active profile, sales designation or management role, central Sales Dashboard permission and target organization. Reps can request only their own detailed history. Authorized admins/managers/sales managers may request an individual or company view, including unassigned credit.
- Month/quarter/year/YoY boundaries use the organization's timezone; comparisons use the same elapsed prior period. The competition stays on the current month when a user changes the performance period.
- Detail records are paginated in the same server response as their full-period total and count. Underlying orders open directly; invoices open read-only. The existing dashboard tabs, quota goals, historical sales imports, company summaries and commissions remain available.
- Invalid/denied responses show a retryable error; they do not become zero standings.

## Coverage and deployment

The seven earlier unmerged draft migrations were consolidated into the CLI-created `reliable_monthly_sales_credit` migration. Their versions were checked against the live migration history before consolidation; they were not applied there. The new migration has not been applied to production by this repair.

Posting is prospective. Migration records existing order/invoice IDs in a private legacy set, so later edits cannot silently credit historical transactions using today's owner. It records coverage start time, which is displayed beside the new metric. Historical sales remain in existing reports. No historical backfill runs, and no historic contract origin is inferred. Any reviewed backfill/origin mapping needs its own audited migration and reconciliation approval.

Apply main's prerequisite schema first, particularly the work-order invoice linkage and existing permission helpers. Install the migration as one transaction. Before activation, review source classification and the read-only reconciliation queries below. Keep the older imported-sales reporting available during rollout.

The admin-only funded-order void-and-unapplied-credit accounting workflow is separate: a performance reversal merely reflects an actual cancelled/voided sale. It is not evidence that a deposit was transferred, a customer-credit balance reconciled, or commission reversed. This PR grants no new ability to void orders or edit financial sources.

## Validation

`tests/sales-credit/database.mjs` executes the real new SQL plus main's actual change-order total trigger in isolated PostgreSQL/PGlite. It covers net-of-tax amounts, delayed approvals, customer-owner snapshots, order/invoice edits and cancellation/reinstatement, project deduplication, recurring allocation/rounding and late links, security origin, legacy exclusion, immutable events, role/module/tenant boundaries and Chicago/DST dates.

`response.mjs` rejects malformed RPC payloads. `browser.mjs` runs real components at 320/390/768/1440px and verifies totals-to-records, pagination, read-only invoices, competition isolation, rep changes, errors/retries and complete tenant-scoped payment/credit history beyond API row limits. The dedicated monthly-credit workflow runs SQL, response, dashboard regressions, typecheck, build and browser checks.
