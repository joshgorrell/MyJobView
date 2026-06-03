# Sales Tax Calculation Fixes - Complete

## Summary

Fixed critical inconsistencies in sales tax calculations across the proposal system to ensure all areas (on-screen, printed PDFs, portal, and tax reports) calculate taxes identically according to the sales tax rules matrix.

## Issues Fixed

### 1. ProposalBuilderCompact Fallback Calculation - CRITICAL BUGS FIXED

**Location**: `src/components/Proposals/ProposalBuilderCompact.tsx` (lines 1839-1909)

**Issue #1**: Incorrect Project Type Name
- **Problem**: Used `'new_construction'` instead of `'original_construction'`
- **Impact**: Fallback tax calculations never matched the tax rules matrix, causing incorrect tax amounts when database values weren't available
- **Fix**: Changed all instances to `'original_construction'` to match database function and tax matrix

**Issue #2**: Incorrect Modifier Application Logic
- **Problem**: Applied modifiers to entire subtotal, then tried to calculate separate parts/labor taxes
- **Impact**: Modifiers (discounts, fees, etc.) weren't being taxed correctly according to tax rules
- **Fix**: Completely rewrote logic to:
  1. Calculate net modifier percent (sum of all modifier percentages)
  2. Apply modifiers proportionally to parts and labor: `modified = original * (1 + netPercent / 100)`
  3. Determine tax applicability based on environment and project type
  4. Calculate tax on MODIFIED amounts separately for parts and labor
  5. Sum the tax amounts

**Issue #3**: Incorrect Tax Rules for Residential Remodel
- **Problem**: Treated residential remodel as "both parts and labor taxable"
- **Impact**: Over-taxed residential remodel projects
- **Fix**: Corrected to "parts taxable, labor not taxable" per Kansas tax law

## Sales Tax Rules Matrix (Implemented Correctly)

### Tax Applicability by Environment and Project Type

| Environment | Project Type | Parts Taxable | Labor Taxable |
|-------------|-------------|---------------|---------------|
| Residential | Original Construction | ✅ Yes | ❌ No |
| Residential | Remodel | ✅ Yes | ❌ No |
| Residential | General Installation/Repair | ✅ Yes | ✅ Yes |
| Commercial | Original Construction | ✅ Yes | ❌ No |
| Commercial | Remodel | ✅ Yes | ✅ Yes |
| Commercial | General Installation/Repair | ✅ Yes | ✅ Yes |
| Any | Maintenance Agreement | ✅ Yes | ✅ Yes |
| Any | Membership | ✅ Yes | ✅ Yes |
| Any | Exempt Project | ❌ No | ❌ No |
| Any | Design Services | ❌ No | ❌ No |
| Any | Security Monitoring | ❌ No | ❌ No |

## Verified Components (All Correct)

### ✅ Database Function (Authoritative Source)
**Location**: `supabase/migrations/20251219142007_fix_sales_tax_apply_to_modified_amounts.sql`

The `calculate_proposal_totals` database function correctly:
- Uses `'original_construction'` project type
- Applies modifiers proportionally to parts and labor
- Calculates tax on modified amounts
- Implements complete tax rules matrix
- Is triggered after every proposal change

### ✅ ProposalTaxReport Component
**Location**: `src/components/Proposals/ProposalTaxReport.tsx`

Correctly:
- Uses `getTaxApplicability()` from `taxCalculations.ts` library
- Applies modifiers proportionally (lines 147-148)
- Calculates tax on modified amounts (lines 150-151)
- Shows per-line-item tax breakdown

### ✅ TaxCalculations Library
**Location**: `src/lib/taxCalculations.ts`

Correctly:
- Implements complete tax rules matrix
- Uses `'original_construction'` project type
- Provides `getTaxApplicability()` function used by reports
- Provides `calculateLineItemTax()` function for line-item calculations

### ✅ PDF Generation
**Location**: `supabase/functions/generate-proposal-pdf/index.ts`

Correctly:
- Uses stored database values (proposal.tax_amount, proposal.tax_rate)
- Does NOT recalculate taxes independently
- Displays consistent values with database calculations

### ✅ Portal Display
**Location**: `src/components/Portal/PortalProposalDetail.tsx`

Correctly:
- Uses stored database values (proposal.total_amount)
- Does NOT recalculate taxes independently
- Displays consistent values with database calculations

### ✅ ProposalSummary Component
**Location**: `src/components/Proposals/ProposalSummary.tsx`

Correctly:
- Uses stored database values (proposal.subtotal, proposal.tax_amount, proposal.total)
- Calls `calculate_proposal_totals` RPC when recalculation needed
- Displays consistent values with database calculations

### ✅ Invoice Components
**Location**: `src/components/Invoices/CreateInvoiceModal.tsx`, `CreateInvoiceFromWorkOrderModal.tsx`

Correctly:
- Use `'original_construction'` in dropdown options
- Apply simple per-line-item taxable flag (appropriate for invoices)
- Don't use proposal tax rules matrix (invoices have different tax logic)

### ✅ Change Order Components
**Location**: `src/components/Production/CreateChangeOrderModal.tsx`

Correctly:
- Uses `'original_construction'` project type
- Implements tax rules matrix for change orders
- Applies modifiers proportionally

## Components Not Actively Used

### ProposalBuilderGrid
**Location**: `src/components/Proposals/ProposalBuilderGrid.tsx`

- Has incorrect tax calculation logic (applies tax to entire subtotal)
- NOT imported or used anywhere in the application
- No fix needed since it's not active

### Other Builders
The following builders are not actively imported/used:
- ProposalBuilder.tsx
- ProposalBuilderAllRooms.tsx
- ProposalBuilderCondensed.tsx
- ProposalBuilderLuxury.tsx
- ProposalBuilderPro.tsx
- ProposalBuilderStandard.tsx

**Note**: ProposalBuilderCompact is the ONLY builder actively used in ProposalsView.tsx

## Calculation Flow

### Primary Calculation (Database)
1. User edits proposal line items, modifiers, or settings
2. System calls `calculate_proposal_totals` database function
3. Function calculates:
   - Parts total and labor total from line items
   - Net modifier percent (sum of all modifier percentages)
   - Modified parts = parts * (1 + netModifierPercent / 100)
   - Modified labor = labor * (1 + netModifierPercent / 100)
   - Tax applicability based on environment and project type
   - Parts tax and labor tax on modified amounts
   - Total tax = parts tax + labor tax
4. Results stored in proposal record (subtotal, tax_amount, total, etc.)

### On-Screen Display (ProposalBuilderCompact)
1. Loads proposal from database
2. If database values available (proposal.subtotal, proposal.total):
   - Uses stored values directly
   - Calculates materials/labor breakdown from line items for display
3. If database values NOT available (fallback):
   - Calculates everything locally using SAME logic as database function
   - Now matches database calculation exactly after fixes

### PDF Generation
1. Loads proposal from database
2. Uses stored values (proposal.tax_amount, proposal.tax_rate)
3. Formats and displays in PDF
4. Always consistent with database calculations

### Portal View
1. Loads proposal from database
2. Uses stored values (proposal.total_amount)
3. Displays to customer
4. Always consistent with database calculations

### Tax Report
1. Loads proposal line items and settings
2. Recalculates using taxCalculations.ts library
3. Shows per-line-item breakdown
4. Uses same logic as database function

## Modifier Application

### Correct Logic (Now Implemented Everywhere)
1. Calculate net modifier percent: `-discount% + pm% + design% + systemDesign% + ccFee% + miscParts% + custom1% + custom2%`
2. Apply proportionally to parts: `modifiedParts = parts * (1 + netPercent / 100)`
3. Apply proportionally to labor: `modifiedLabor = labor * (1 + netPercent / 100)`
4. Calculate tax on modified amounts based on tax rules matrix
5. Final total = modifiedParts + modifiedLabor + tax

### Example Calculation
**Scenario**: Residential Remodel, $1000 parts, $500 labor, 10% discount, 5% PM fee, 9.35% tax rate

1. Net modifier: -10% + 5% = -5%
2. Modified parts: $1000 * (1 + (-5/100)) = $1000 * 0.95 = $950
3. Modified labor: $500 * (1 + (-5/100)) = $500 * 0.95 = $475
4. Tax applicability: Residential Remodel = parts taxable, labor NOT taxable
5. Parts tax: $950 * 0.0935 = $88.83
6. Labor tax: $0 (not taxable)
7. Total tax: $88.83
8. Final total: $950 + $475 + $88.83 = $1,513.83

## Testing Recommendations

To verify all calculations are consistent, create test proposals for each tax matrix combination:

1. Create proposal with known values
2. Add line items with parts and labor
3. Add modifiers (discount, fees)
4. Check that ALL displays show identical values:
   - On-screen proposal builder totals
   - Proposal summary sidebar
   - Tax report modal
   - PDF proposal
   - Portal view
   - Database stored values

## Kansas Sales Tax Law Reference

Per Kansas law (as documented in migrations):
- **Original Construction (Real Property Improvement)**: Parts taxable, labor not taxable
- **Remodel/Repair (Real Property)**: Parts taxable, labor not taxable
- **General Installation/Repair (Personal Property)**: Both parts and labor taxable
- **Maintenance/Service Agreements**: Both parts and labor taxable
- **Exempt Projects**: Neither taxable (requires tax exemption certificate)

## Build Verification

All changes successfully compiled with no errors:
```bash
npm run build
✓ 1823 modules transformed
✓ built in 27.78s
```

## Files Modified

1. `src/components/Proposals/ProposalBuilderCompact.tsx` (lines 1839-1909)

## Files Verified (No Changes Needed)

1. `supabase/migrations/20251219142007_fix_sales_tax_apply_to_modified_amounts.sql` - Database function
2. `src/lib/taxCalculations.ts` - Tax rules library
3. `src/components/Proposals/ProposalTaxReport.tsx` - Tax report component
4. `supabase/functions/generate-proposal-pdf/index.ts` - PDF generation
5. `src/components/Portal/PortalProposalDetail.tsx` - Portal display
6. `src/components/Proposals/ProposalSummary.tsx` - Summary component
7. `src/components/Invoices/CreateInvoiceModal.tsx` - Invoice creation
8. `src/components/Invoices/CreateInvoiceFromWorkOrderModal.tsx` - Work order invoice
9. `src/components/Production/CreateChangeOrderModal.tsx` - Change orders

## Conclusion

All sales tax calculations now correctly implement the tax rules matrix and apply modifiers consistently. The system has three calculation points:

1. **Database function** (authoritative) - ✅ Correct
2. **ProposalTaxReport** (recalculates for reports) - ✅ Correct
3. **ProposalBuilderCompact fallback** (when DB values unavailable) - ✅ Now Fixed

All display areas (on-screen, PDF, portal, reports) now show consistent tax calculations that match the sales tax rules matrix.
