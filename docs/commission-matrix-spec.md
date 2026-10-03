# Dealer commission matrix

Status: requirements confirmed October 3, 2026; implementation revision required. This supersedes the independent sales/design percentages in draft PR #79. It does not apply new rates to production or historical records.

## Confirmed model

Each dealer configures commissions by sale type and work role. User setup controls whether a person is eligible; their assigned role on the sale determines their share. Application access roles such as administrator or technician must not substitute for the person's work role on that sale.

Electronic Life's example is a 7% pool, with a 1% designer share taken from that pool when a separate eligible person designs the job. It is not 7% sales plus another 1% design.

| Sale type | Pool | Salesperson without separate eligible designer | Salesperson with separate eligible designer | Separate designer |
| --- | --- | --- | --- | --- |
| Proposal-based sale | 7% | 7% | 6% | 1% |
| Service, without proposal | 7% | 7% | 6% | 1% |
| Retail | 7% | 7% | Not applicable | Disabled |

These are example dealer settings, not platform defaults to impose on every tenant. Dealers can configure their own pool and role shares per sale type. Additional configured roles must fit the explicitly configured budget; the software must not silently add department/PM percentages to the pool. Existing service department settings require a reviewed mapping into the new matrix.

## Eligibility and attribution

- Add **Eligible for commissions** to both Add User and Edit User, using the existing employee commission configuration as the single source of truth. The commission management screen reads and writes that same flag.
- Active status, organization membership and effective eligibility dates also apply. Selecting someone as a salesperson or designer does not automatically make them eligible.
- Capture sales and design attribution before a proposal becomes a sale. The current project-only designer assignment is too late for deposits and time-of-sale earnings.
- Service work needs explicit salesperson and optional designer assignment independent of a proposal. Retail needs explicit salesperson assignment and no designer allocation.
- If the salesperson designs their own job, they receive the full salesperson pool once. If a different assigned designer is ineligible, no design deduction is made and the eligible salesperson retains that slice.
- If the salesperson is ineligible or missing, do not redirect their share to the creator, designer or department. Show the unallocated amount for management review. An eligible separate designer can still earn their configured slice.
- Snapshot matrix version, sale type, work-role recipients, eligibility and effective percentages at recognition. Later user/configuration edits must not rewrite earned or paid history.

## Calculation basis

The dealer selects **Pretax revenue** or **Gross profit dollars**. Josh confirmed profit dollars rather than margin tiers.

Pretax revenue excludes sales tax and non-revenue payment convenience fees. Gross profit is commissionable pretax revenue minus the approved direct costs attributable to that sale. A margin percentage itself is not the commission base. Margin-tier rates are outside this confirmed model.

For a $10,000 pretax sale with $6,000 of approved costs:

- Revenue basis, 7% pool: $700 total; a separate designer receives $100 and the salesperson $600.
- Profit basis, 7% pool: $280 total on $4,000 profit; a separate designer receives $40 and the salesperson $240.

Cost provenance is required: do not treat missing costs as zero, or use materials alone when labor costs are omitted. Keep incomplete-cost earnings visibly pending cost review. Time-of-sale profit calculations need an approved cost snapshot; later cost changes produce auditable adjustments rather than replacing paid history.

## Earning timing

The dealer selects **Cash basis** or **Time of sale**, independently from calculation basis and payroll frequency.

- Cash basis: the role's total commission accrues proportionally as real invoice principal is collected. A payment covering 50% of the invoice, including its proportionate tax, earns 50% of each role's commission. Convenience fees do not advance that fraction. Signed refunds reverse the corresponding earnings; rounded cumulative differences keep installments equal to the total entitlement.
- Time of sale: the full commission is earned once the sale is finalized, regardless of collections. Proposed recognition events are an accepted sales order for proposal work, a posted customer invoice for service, and a finalized retail sale. Drafts, unaccepted proposals and incomplete checkout do not create earnings.
- Recognition makes commission eligible for the normal approval/payroll workflow; it does not initiate a bank payment automatically.
- Cancellation, returns and credit notes create auditable reversals. Customer payment reversals alone do not reduce time-of-sale earnings unless the underlying sale is reduced/cancelled.

## Required implementation changes

1. Versioned tenant matrix with separate proposal/service/retail rows, pool and role-share validation, calculation basis and earning timing. Keep existing rate settings until a dealer explicitly adopts a reviewed matrix.
2. User setup eligibility backed by the existing configuration, saved securely for new and existing employees.
3. Proposal-time designer attribution, non-proposal service designer attribution, and explicit retail classification. Do not classify every invoice without a project as retail.
4. A sale-level entitlement with unique recognition identity, linked invoice collections and frozen policy snapshot. Progress invoices, deposits, sales-order conversion and change orders must not pay the same sale twice. Cash earnings can stay invoice-linked, but a sale-level cap reconciles them to the entitlement.
5. Approved cost snapshots for profit calculations, cost review state and correction ledger.
6. One calculation engine for ledger, sale previews and reports. Reports use payment dates for cash earnings and sale recognition/correction dates for time-of-sale earnings. Display earned, approved, paid and outstanding separately.
7. Replace ordinary per-employee rate overrides with eligibility-driven dealer matrix rates. Retain old overrides/history for reconciliation; exceptional future overrides, if supported, require explicit audited authorization.

Acceptance cases: rep alone; separate designer; rep also designer; ineligible rep/designer; service with/without designer; retail designer prohibition; pretax/tax/fee treatment; revenue/profit examples; partial receipts/refunds; time-of-sale without payment; draft/cancel/return; deposit and progress-invoice duplication; missing/updated costs; matrix edits; multi-tenant isolation and own-employee visibility.

Draft PR #79 remains foundational repair code and must not be described as implementing this matrix until the changes above are completed and verified.
