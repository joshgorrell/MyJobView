# Proposal Approval Tax Fields Fix

## Problems Fixed

### Error 1: Missing Tax Fields
```
null value in column "tax_environment" of relation "invoices" violates not-null constraint
```

### Error 2: Wrong Column Name
```
column "taxable" of relation "invoice_line_items" does not exist
```

## Root Causes

1. **Missing Tax Fields**: The `handle_unified_proposal_approval()` function automatically creates deposit invoices when proposals are approved, but it was not including the required tax fields:
   - `tax_environment` (residential/commercial)
   - `tax_project_type` (general_installation_repair, new_construction, etc.)

   These fields were made required in migration `20251208150153_make_invoice_tax_fields_required.sql` for proper sales tax calculation, but the approval trigger was never updated to include them.

2. **Wrong Column Name**: The function was using `taxable` for invoice line items, but the actual column name is `is_taxable`.

## Solutions Applied

### Fix 1: Add Tax Fields to Invoice Creation

Updated the `handle_unified_proposal_approval()` function to include both required tax fields when creating deposit invoices:

```sql
INSERT INTO invoices (
  ...
  tax_environment,
  tax_project_type,
  ...
) VALUES (
  ...
  COALESCE(NEW.tax_environment, 'residential'),
  COALESCE(NEW.tax_project_type, 'general_installation_repair'),
  ...
)
```

### Fix 2: Correct Column Name for Line Items

Changed from `taxable` to `is_taxable`:

```sql
INSERT INTO invoice_line_items (
  invoice_id,
  description,
  quantity,
  unit_price,
  amount,
  is_taxable  -- Was: taxable
) VALUES (...)
```

### Default Values

If the proposal doesn't have these values set:
- **tax_environment**: Defaults to `'residential'`
- **tax_project_type**: Defaults to `'general_installation_repair'`

These defaults match the most common use case and ensure invoices can always be created.

## What Was Fixed

The function now properly includes tax fields in **BOTH** scenarios where deposit invoices are created:

1. **Deposit Already Paid Flow** (lines 112-158)
   - When a proposal is approved with deposit already received
   - Creates a paid deposit invoice

2. **Deposit Required Flow** (lines 185-238)
   - When a proposal is approved and deposit is required
   - Creates an unpaid deposit invoice

## Migrations Applied

1. **fix_proposal_approval_invoice_tax_fields.sql** - Added tax fields to invoice creation
2. **fix_proposal_approval_taxable_column_name.sql** - Fixed column name from `taxable` to `is_taxable`

Both migrations update the same function: `handle_unified_proposal_approval()`

## Testing

To verify the fix works:

1. **Create a proposal** with tax settings
2. **Approve the proposal** (manually or via customer portal)
3. **Verify**:
   - No error occurs
   - Deposit invoice is created successfully
   - Invoice has correct tax_environment and tax_project_type values
   - Sales order is created and linked

## Impact

This fix ensures:
- ✅ Proposals can be approved without errors
- ✅ Deposit invoices are created with proper tax classification
- ✅ Sales tax calculations will work correctly on deposit invoices
- ✅ All invoice creation workflows now include required tax fields

## Related Systems

This affects the entire proposal approval workflow:
- Manual approvals by sales reps
- Customer portal approvals
- Purchase order acceptance
- Deposit payment flows
- Sales order creation
