# Sales Order billing deployment gate

**Do not enable the new invoice UI until these checks pass on the target environment.**

1. Verify migrations in source control, and apply in timestamp order using the existing deployment pipeline: `20261113130000_sales_order_billing_rows.sql`, `20261113143000_sales_order_billing_row_allocations.sql`, `20261113153000_guard_so_billing_allocations.sql`, `20261113170000_so_invoice_contract_cap.sql`, `20261113190000_atomic_so_invoice.sql`.
2. Run `supabase/tests/so_billing_deployment_readiness.sql` against the target. All six required objects must show READY; confirm the invoice and allocation triggers exist.
3. Check authenticated Data API grants and RLS for the new billing tables and security-invoker balance view. Verify cross-tenant access is denied.
4. In isolated staging, create a Sales Order with two payments and an approved CO. Test partial and combined invoicing, simultaneous submissions, over-cap rejection, void/rebill, negative CO credit, and QBO sync. Verify a deliberately failed line-item or allocation insert leaves **no** invoice, CO billing update, or customer credit.
5. Check the UI's total and tax calculations against persisted invoice totals. Confirm historical invoices remain unchanged.
6. Only after successful staging tests, schedule production migration and post-deploy smoke test.

**Observed 2026-11-13:** Connected MJV project `bqtsuzvuvqvgidipbsis` lacked the billing row allocations table, invoice cap function, and atomic RPC, despite GitHub PRs being merged. Supabase branch creation requires cost approval; no production migration was applied as part of this readiness work.
