# Manual Approval Modal - Deposit Configuration Fix

## Problem

The Manual Approval modal was recalculating the deposit amount instead of using the pre-calculated `deposit_amount_due` from the proposal's Billing tab. This caused discrepancies, especially with "Parts Total" deposit type, where the recalculation didn't account for modifiers that were already applied in the database.

## Root Cause

In `ManualApprovalModal.tsx`, the `loadProposalSettings()` function was:
1. Loading deposit settings from `proposal_settings` table
2. **Recalculating** the deposit amount based on the type
3. For "Parts Total" type, it was calculating from `proposal_line_items` using `price * quantity`
4. This calculation was wrong because:
   - It didn't use the pre-calculated `parts_total` column from proposals table
   - It didn't account for modifiers (project management, system design, etc.)
   - The calculation method didn't match the database function

## Solution

Modified `ManualApprovalModal.tsx` to:

### 1. Use Pre-Calculated Deposit Amount (Primary Fix)
- Load `deposit_amount_due` from the proposals table (line 58)
- Use this pre-calculated value instead of recalculating (lines 95-106)
- This value is already calculated by the `calculate_proposal_totals` database function with all modifiers applied

### 2. Fix Parts Total Calculation for Manual Changes
- When user changes deposit type to "Parts Total", use the pre-calculated `parts_total` from proposals table (lines 541-550)
- This ensures consistency with the database calculation

### 3. Recalculate After Approval
- Added call to `calculate_proposal_totals` after updating settings (line 345)
- This ensures the `deposit_amount_due` is updated if user modifies deposit settings during approval

### 4. Enhanced User Experience
- Added visual summary showing deposit configuration from Billing tab (lines 429-481)
- Shows deposit type, amount, and calculation details at a glance
- Clear messaging that settings are loaded from Billing tab
- Indicates when settings have been modified

## Files Modified

1. `/src/components/Proposals/ManualApprovalModal.tsx`
   - Updated `loadProposalSettings()` to use pre-calculated deposit
   - Fixed deposit type change handler to use `parts_total` column
   - Added recalculation call after approval
   - Added deposit summary UI

## How It Works Now

1. **On Modal Open:**
   - Loads `deposit_amount_due` from proposals table (pre-calculated by database)
   - Displays this amount to the user
   - Shows deposit configuration summary from Billing tab

2. **If User Edits Deposit Settings:**
   - Changes are reflected in real-time
   - For "Parts Total", uses the pre-calculated `parts_total` column
   - For "Percentage", calculates based on current percentage
   - For "Custom", allows manual entry

3. **On Approval:**
   - Saves modified settings back to `proposal_settings`
   - Calls `calculate_proposal_totals` to update `deposit_amount_due`
   - Ensures Billing tab reflects any changes made during approval

## Benefits

1. **Single Source of Truth**: Deposit calculation happens in one place (database function)
2. **Consistency**: Manual approval and Billing tab always show the same deposit amount
3. **Accuracy**: Parts Total type now correctly includes all modifiers
4. **Flexibility**: Users can still edit deposit settings during approval if needed
5. **Transparency**: Clear indication of what was configured in Billing tab

## Testing Recommendations

1. Test with "Parts Total" deposit type - should match Billing tab exactly
2. Test with "Percentage" deposit type - should calculate correctly
3. Test with "Custom" deposit type - should show configured amount
4. Test editing deposit settings during approval - should save back to proposal
5. Verify Billing tab shows updated settings after approval with modifications
