# Commission system: verified audit and implementation guardrails

Tracking: #468. Review date: 2026-11-05. Scope: main branch, source inspection; **not** a production data audit.

## Critical finding: do not assume the dealer matrix is deployed
- PR #79 (dealer matrix and margin tiers) is **open and unmerged** as of this audit. Its design cannot be treated as current main behavior.
- PR #210 (exclude tax and card fees from invoice commission basis) **is merged**. Preserve and regression-test its basis calculation.

## Verified main-branch UI and data entrypoints
| Path | Actual behavior / concern |
| --- | --- |
| `src/components/Commissions/CommissionsPage.tsx` | Nine tabs; settings and employee setup are separate tabs, with records/approval/payment/reporting alongside. |
| `src/components/Commissions/CompanyCommissionSettings.tsx` | Reads/writes `company_commission_settings`, including gross/profit basis, project sales, design, PM, service sales, `service_pm`, contracts, role eligibility. `service_pm` is described as managing service projects; this conflicts with desired departmental allocation. |
| `src/components/Commissions/EmployeeCommissionConfig.tsx` | Reads/writes `employee_commission_config`; nullable custom rates and separate sales-threshold bonus. Same `service_pm` terminology. |
| `src/components/Projects/ProjectRoleAssignment.tsx` | Updates project salesperson, designer, assigned PM. Uses company role eligibility. Does not itself prove proposal-to-order inheritance. |
| `src/components/Sales/SalesOrderCommissionsTab.tsx` | Reads commission records, company settings and employee configs to display project commissions; includes service PM display label. |
| `src/components/Invoices/InvoiceDetailModal.tsx` | Exposes `sales_order_id` and `source_type` in invoice model; absence of a commission UI in this component alone is not evidence that invoice overrides are implemented elsewhere. |

## Required business semantics
- Three invoice categories only: **project sales-order invoice**, **standalone service invoice**, **retail invoice**. No project-linked service invoice.
- Proposal assignments: Sales Rep, Designer, PM. Preserve into project sales order; project invoices derive credit from the order, not independent obligations.
- Standalone service invoice: Sales Rep **3%**, Service Department **3%** as EL requested defaults; **independent editable percentages** per invoice, subject to permissions. Department is not a manager's personal commission.
- Retail invoice: separate configurable Sales Rep commission.
- PM role assignment does not imply an automatic earned commission. Any later completion/performance spiff is a distinct rule.
- Accrual based on eligible pretax funds received; partial payments, credits, refunds, card fees, and reversal behavior must be covered by tests.
- Rule edits apply prospectively, with transaction snapshots/audit history, not retrospective mutation of earned amounts.

## Implementation phases (do not skip)
1. **Trace data path and database functions**: all schema/migrations/triggers for `company_commission_settings`, `employee_commission_config`, `commission_records`, invoice payments and credits, proposal acceptance and sales-order conversion. Confirm current effective values from DB separately.
2. **Choose one rule authority**: document precedence among company defaults, employee override, project/transaction override, and margin tiers. Do not introduce the PR #79 matrix without reconciling with main.
3. **Build tests first**: project installment invoice, standalone service invoice 3+3 split and overridden split, retail, designer split, noncommissioned PM, no double accrual, taxes/fees, partial payment, refund, retroactive-rate protection, permission enforcement.
4. **Consolidate settings UX**: single Commissions > Settings destination, grouped Project / Service / Retail / Employee & Advanced; explain rule basis and precedence, preview outcomes, allow authorized edits, provide effective dates and audit trail.
5. **Implement invoice-specific service allocation** and service department recipient mapping; do not merely relabel `service_pm` database values or silently migrate old records.
6. **Validate**: TypeScript/build, targeted tests, responsive layout, RLS/permissions, sales-order billing reconciliation, no regression to Techsafe integration.

## Release gate
No billing trigger or commission migration may be merged until tested against representative project/service/retail transactions. Do not change existing production defaults to 3/3 based only on this document. Confirm and stage changes explicitly.
