# Techsafe source integration: reuse MJV's Sales Order authority

## Audit finding (2026-11-10)

**Do not implement another change-order application engine or a second
Sales Order product-list builder for Techsafe.** MJV already stores approved
Sales Orders and change-order history, and its original change-order migration
explicitly specifies automatic Sales Order updates on final approval.

Confirmed repository sources:

- `supabase/migrations/20251204192059_create_comprehensive_change_order_system.sql`:
  `change_orders.sales_order_id`, `revision_number`, `customer_approved`,
  `change_order_line_items` with `add`, `remove`,
  `modify_quantity`, `modify_price`, plus approval/history tables.
- `supabase/migrations/20261108194000_techsafe_sales_order_equipment_scope_inspection.sql`:
  existing private scope inspection already counts base proposal lines, approved
  and pending change orders, unsupported actions, and cross-tenant lines.
  It explicitly does **not** authorize export.
- `src/lib/techsafe/equipmentReconciliation.mjs`:
  separate Techsafe-only change application/reconstruction logic. This is
  potential duplication of MJV's own Sales Order calculations.
- `src/lib/techsafe/postgresBaseEquipmentScanner.mjs` and
  `postgresTransactionalBaseAudit.mjs`: read only the original proposal
  lines; they are **not** the current Sales Order product list.
- `src/lib/techsafe/verifiedSourceRead.mjs`: currently invokes the separate
  Techsafe equipment reconciler rather than an established MJV final-equipment
  projection.

## Required source-of-truth investigation before implementation

1. Locate the actual production MJV function/query used by Sales Order detail
   pages and invoice/project workflows to display **current equipment after
   approved change orders**. Confirm whether approval mutates base rows,
   maintains a derived view, or produces a calculated projection.
2. Trace how approval/signature is persisted and how MJV prevents an
   unapproved proposal or pending change from entering that projection.
3. Verify quantity, line identity, product identity, pricing, removed lines,
   customer-supplied items and exclusion semantics against that existing
   projection. Test a Sales Order with multiple approved change orders.
4. Expose/reuse the same trusted server-side projection under the existing
   tenant, connection and SERIALIZABLE revision checks. **Do not** introduce
   a second independent change-order reducer.
5. Compare the existing Techsafe `reconcileApprovedSalesOrderEquipment`
   result with MJV's projection for regression only; retire the duplicate
   transformation from the live path after parity is proven.

## Safety boundary

Keep private certificate storage, revision freshness, tenant scope,
transaction rollback and authenticated receiver validation. These protect
transport and source integrity; they do not replace MJV business logic.

No live sync, dispatch, plan activation, schema migration, or customer data
change is authorized by this audit. **The current production projection has
not yet been located or verified; do not claim source parity until it is.**
