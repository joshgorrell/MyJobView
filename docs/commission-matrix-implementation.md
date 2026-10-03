# Dealer commission matrix implementation

The draft branch implements the three commission methods for proposal/project, service and retail sales. Both earning timings are supported. It has not been deployed or applied to production.

## Dealer setup

In Finance → Commissions → Commission Settings, review and activate the dealer matrix. Each sale type has a total pool, designer share, PM share and (service only) department allocation. All role shares come from that pool. A separate eligible designer gets their slice; otherwise the eligible rep retains it. Retail has no designer. Missing/ineligible reps do not transfer their residual allocation to another recipient.

Select fixed pretax sales, fixed gross profit dollars, or margin-tier sliding scale. Sliding scale selects a rate using exact GPM and applies it to the chosen revenue or profit-dollar base. Thresholds, rates and role shares are editable. The displayed 10/20/30/40/50% schedule and lower rates are examples, requiring dealer review; the below-minimum row defaults to zero.

Saving makes an immutable policy version. Adoption is forward-only: sales predating the first active matrix and invoices with existing commission records keep their original calculation path. Quotes created under an earlier matrix version keep it when their deposit/order is generated later. Historical rates and paid balances are not backfilled.

## Users and sales

Add/Edit User → Sales includes **Eligible for commissions**, backed by the same configuration as the commission management screen. Eligibility does not grant application permissions. New matrix rates come from the dealer and assigned work role; legacy employee overrides remain stored for older sales.

Commission review panels are available in Proposal Settings, Sales Order Commissions and Invoice Details. Commission Overview also lists up to 50 recent matrix sales awaiting review. A manager verifies sale type, assigned people and amounts. A finalized sale is reviewed once before earnings are released; an unaccepted proposal or draft invoice can save attribution but cannot earn. This review is distinct from payroll approval or payout.

Non-proposal service may have a designer. Standalone invoices require explicit classification; no missing-project invoice is silently treated as retail. Known service work orders prefill the service type and assigned salesperson. A reviewed sale locks attribution. A deposit linked before review joins the proposal entitlement, and its obsolete standalone review row is cancelled.

Revenue and total come from the source invoice/proposal when available. Non-proposal/manual orders and change-order corrections require a complete sale amount review. Profit and sliding methods require explicitly approved direct costs, including applicable material and labor costs. Missing cost is different from known zero cost. The saved calculation shows the selected pool and commission base. The ledger computes with the unrounded margin.

## Earnings and corrections

- Cash timing prorates the whole-sale entitlement using real invoice principal collected, including proportionate invoice tax in its denominator. Out-of-invoice convenience fees do not advance collection progress. Proposal deposits and progress invoices share a sale identity and cap; overcollection cannot earn beyond the entitlement.
- Sale timing earns the whole commission when the finalized sale is reviewed, dated to the source sale's finalization date in the dealer's timezone. Collections and payment reversals alone do not create or reverse another sale-time commission.
- Rounded role amounts fit within the rounded pool. Installments reconcile to cumulative entitlement amounts.
- Refunds, deleted/moved receipts, void invoices, cancelled proposals and approved corrections create ledger deltas. Existing payroll `amount_paid` is retained. A newly approved cost correction uses the correction date, including when a previously zero tier first becomes eligible for commission.
- Source revenue changes and approved change orders hold further accrual for review. Updating the complete sale revenue/total/cost with a review note releases the hold and records the resulting correction using the original policy version. The approved cost/revenue correction does not silently substitute a new dealer matrix.
- The earnings report combines legacy revision-2 cash calculations with revision-3 earning events. Cash collections, sale recognition and corrections use their own dates. Event rate snapshots preserve historical display when an approved cost correction changes the tier. Shared basis tracking prevents a newly introduced role from counting sale revenue again.

Financial tables and mutation helpers are client read-only. Public management RPCs check active management membership, source ownership, recipient tenant, finalized state, valid rates and review notes. Invoice/sale links must match the actual source identity. Active reps retain access only to their own financial records. Reviews and earning events preserve attribution and financial corrections.

## Validation and rollout

`npm run test:commissions` covers the original invoice/payment repair, matrix SQL/RLS, periods, report runtime and matrix/review UI runtime. Matrix cases include solo/split/same-person roles; ineligible people; retail designer prohibition; revenue and profit examples; both sliding bases; thresholds and just-below boundaries; below-minimum and negative margins; partial payments, tax and fees; refunds, movement and removal; overpayment caps; sale-time earnings without invoices/payments; cost corrections, idempotency and correction dates; proposal/deposit/order identity; late linkage; change-order holds; rounded cents; historical report reconciliation and tenant isolation.

The production frontend build, lint of the new matrix components and period helper, commission suite and security onboarding suite pass. Lint across all touched existing screens still reports existing issues. Before integrating the concurrent security-billing changes, repository-wide typecheck had 1,508 diagnostics on both the checked base and matrix branch, with no new diagnostic messages. The integrated branch has 1,487 diagnostics and no new diagnostic messages compared with that checked matrix branch.

The matrix SQL fixture applies the real security invoice-commission trigger migration before the matrix migration. The final migration restores the shared commission handler so invoice updates cannot overwrite matrix earnings. Unclassified recurring security-monitoring invoices remain on the separate legacy contract path. Receipt date edits are represented as dated reversing/replacement events; approved cost corrections retain their own review date.

Before merge/deployment, validate both commission migrations on an isolated staging copy with the complete production tax/deposit/notification trigger graph. Verify representative manual, Stripe and QBO receipts and fee mappings; the new column requires explicit out-of-invoice fees from each writer. Apply migrations before deploying the frontend. Review actual dealer matrix rates and direct-cost practices before activation. No production financial values were changed during development.

Payroll approval actions, atomic payout recording/statements, draw recovery and historical reconciliation remain a separate phase. Contract-term commissions (security/VIP/service-plan contracts) retain their separate legacy system; this matrix implements the three requested sale types and does not redefine contract-term payouts.
