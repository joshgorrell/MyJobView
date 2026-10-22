# Monthly Sales Performance and Competition — implementation contract

## Scope
This is a performance-credit metric, **not** a commission calculation. Never derive commission from this metric.

## Attribution and transaction ledger
- Booked project/commercial sales orders count at the booked date, credited to the sales rep on the order.
- Service, time-and-materials, and retail invoices count at the finalized/posted invoice date, credited to the sales rep **who owns the customer**, even when dispatch or another employee created the invoice.
- Capture the credited rep and source customer on a durable immutable credit ledger at the qualifying event; later customer reassignment must not rewrite prior leaderboard results.
- Do not include draft, cancelled, voided or reversed transactions. Credit notes, refunds, cancellations and changes must produce traceable negative adjustments according to effective posting date; never silently erase prior credit.
- Sales tax is not revenue. Use net-of-tax amounts; establish consistent treatment of discounts, credits and freight before deployment.
- Do not count an invoice arising from an already-credited sales order again. Distinguish project-progress/final invoices from **incremental** service/retail invoices, including invoices with mixed lines.
- An unassigned customer's invoice is company/unassigned credit, not arbitrarily attributed to the creator.
- Preserve transaction-level provenance: source type/id, customer id, credited rep id, effective date, net amount, adjustment relationship, organization id, attribution reason. Enforce uniqueness/idempotency on source credit events.
- Migration/backfill must explicitly reconcile existing booked orders and invoices without duplicating historical totals.

## Time periods
- On opening the dashboard, a sales rep sees **This Month**, current local calendar month, by default.
- Other periods: This Quarter, This Year, Year over Year (same elapsed dates in prior year). Historical own data remains accessible.
- Monthly leaderboard resets at month boundary; do not delete history.
- Monthly leaderboard sums booked sales orders plus separately qualified service and retail invoice credits, including negative adjustments. Show one combined monthly total; own breakdown may show source categories.

## Access control
- Sales reps may see their own detailed history and transaction drilldowns.
- All sales reps may see **only the current month's** ranking and aggregate credited dollar total for other reps; no historical period parameter, source breakdown, customer data, order/invoice ids, or drilldowns for other reps.
- Authorized managers/admins may access company totals, individual history and details.
- Implement separate restricted RPC for current-month leaderboard with server-side auth, org scoping and no arbitrary date argument. Do not use existing goal-attainment RPC as a backdoor to historical sales or quota figures.
- Never fetch other reps' transaction rows client-side and hide them in UI. Enforce permissions on the server and through RLS.
- Changing UI dates must not alter the current-month competition scope.

## Required validation
1. $800 dispatch-created T&M invoice for customer owned by rep A adds $800 to A, not dispatcher.
2. $20,000 booked sales order with $20,000 final invoice contributes $20,000 total, not $40,000.
3. Retail invoice owned by rep B credits B; unassigned customer credits neither rep.
4. Customer reassigned A to B after posting does not rewrite A's credited history.
5. Cancellation/refund produces auditable reversal; duplicate webhook/import is idempotent.
6. Rep A cannot request rep B's historical numbers or source rows by changing network parameters.
7. Manager sees full authorized history; reps see only current-month shared leaderboard.
8. Month transition resets current leaderboard without deleting prior results.
9. Sales performance totals remain separate from funds-received commission.
10. This Month/Quarter/Year/YoY totals use the same credit ledger and reconciled boundaries.

## Existing code audit findings (2026-10-21)
- `get_sales_goal_leaderboard` currently ranks annual quota attainment and is not the monthly revenue competition.
- `get_sales_team_dashboard` aggregates sales-order-based individual quota periods; it does not implement combined customer-owned service/retail credits.
- `useSalesDashboard` mixes quota-period RPC metrics with current-month activity counts. Period selection requires a backend reporting contract, not only a frontend selector.

## Merge dependency
PR #255 and PR #256 are separate UI changes. This ledger/permission work must be implemented, tested and reconciled with both before the combined monthly competition is called complete.
