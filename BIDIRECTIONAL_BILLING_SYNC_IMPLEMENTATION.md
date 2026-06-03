# Bidirectional Billing Synchronization Implementation

## Overview
Implemented full bidirectional synchronization between approval workflows and the Billing tab, ensuring deposit and payment term changes reflect immediately in both locations.

## Key Changes

### 1. New Component: BillingConfigSummary
**File:** `src/components/Proposals/BillingConfigSummary.tsx`

- Reusable summary component showing deposit, payment terms, and acceptance methods
- Two display modes: compact inline and full card layout
- Used in both approval modals to show current billing configuration
- Clean, professional design with proper formatting

### 2. ManualApprovalModal Enhancements
**File:** `src/components/Proposals/ManualApprovalModal.tsx`

#### Auto-Save Functionality
- Added `autoSaveToDatabase()` function that saves changes immediately to `proposal_settings` table
- Debounced auto-save with 500ms delay to avoid excessive database calls
- Saves deposit_type, deposit_percent, deposit_amount, require_deposit, and all modifiers
- Automatically recalculates proposal totals via `calculate_proposal_totals` RPC function
- Reloads updated deposit_amount_due after recalculation

#### UI Improvements
- Added auto-save status indicator (Saving.../Saved with timestamp)
- Renamed "Billing Adjustments" section to "Deposit & Payment Terms"
- Added BillingConfigSummary at top showing current configuration
- Enhanced collapsed section header with inline summary showing:
  - Current deposit type and amount
  - Payment terms
  - "Has Modifiers" badge when applicable
- Clear messaging that changes sync with approval workflows

#### Fields That Auto-Save
- Deposit type (percentage/parts_total/custom/none)
- Deposit percentage
- Custom deposit amount
- Require deposit toggle
- Project management percent
- System design percent
- Credit card fee percent
- Misc parts percent
- Payment terms

### 3. ApprovalActionModal Enhancements
**File:** `src/components/Proposals/ApprovalActionModal.tsx`

#### Auto-Save Functionality
- Similar auto-save implementation with 500ms debounce
- Saves deposit configuration changes to proposal_settings immediately
- Recalculates totals and reloads deposit_amount_due

#### New Collapsible Deposit Configuration Section
- Added collapsible "Deposit Configuration" section (minimized by default)
- Shows summary when collapsed: deposit type and amount
- When expanded, provides full editing capability:
  - Deposit type selector (Percentage/Parts Total/Custom)
  - Deposit percentage input (when percentage type selected)
  - Deposit amount input
  - Quick preset buttons (25%, 50%, 75%, 100%)
- Auto-save indicator showing save status
- All changes sync back to Billing tab immediately

#### User Experience
- Section starts collapsed to keep UI clean
- Summary visible in collapsed state for quick reference
- Expand to edit if needed during approval process
- Changes save automatically as user types (with debounce)

### 4. ProposalSettings (Billing Tab) Auto-Save
**File:** `src/components/Proposals/ProposalSettings.tsx`

#### New Auto-Save System
- Added `billingAutoSaveTimer` ref and `billingAutoSaving` state
- Auto-saves billing configuration changes after 1 second of inactivity
- Monitors changes to:
  - deposit_type, deposit_percent, deposit_amount
  - require_deposit, acceptance_methods
  - payment_schedule, progress_billing_type
  - progress_invoice_terms, balance_payment_terms

#### Database Synchronization
- Updates proposal_settings table immediately
- Calls `calculate_proposal_totals` RPC to recalculate deposit_amount_due
- Reloads proposal to get updated calculated deposit amount
- Updates local state with new calculated amount for percentage/parts_total types

#### Visual Feedback
- Added Loader2 spinner with "Saving..." text during auto-save
- Updated messaging to indicate changes sync with approval workflows
- Removed dependency on manual Save button for billing changes

### 5. DepositConfiguration Component
**File:** `src/components/Proposals/DepositConfiguration.tsx`

- No changes needed - already uses onChange callbacks properly
- Parent component (ProposalSettings) handles auto-save
- Changes propagate through onChange → setSettings → useEffect → auto-save

## Data Flow

### From Billing Tab to Approval Modals
1. User changes deposit settings in Billing tab
2. onChange updates local settings state
3. useEffect detects change and triggers auto-save timer (1 second)
4. Auto-save updates proposal_settings table
5. calculate_proposal_totals RPC recalculates deposit_amount_due
6. Updated values immediately available when approval modal opens

### From Approval Modals to Billing Tab
1. User changes deposit settings in approval modal
2. onChange updates local state
3. useEffect detects change and triggers auto-save timer (500ms)
4. Auto-save updates proposal_settings table
5. calculate_proposal_totals RPC recalculates deposit_amount_due
6. Updated values reflected in Billing tab on next view

### Key Synchronization Points
- Both locations save to same `proposal_settings` table record
- Both call `calculate_proposal_totals` after saving
- Both reload `deposit_amount_due` from proposals table
- Single source of truth: proposal_settings table
- Calculated values: proposals.deposit_amount_due (updated by RPC function)

## User Experience Improvements

### Approval Workflow
- **Minimized by default:** Deposit configuration sections start collapsed
- **Quick summary:** See key details without expanding
- **Edit when needed:** Expand to modify settings during approval
- **Immediate feedback:** Auto-save indicator shows changes are saving
- **No manual save:** Changes apply automatically

### Billing Tab
- **Real-time sync:** Changes appear in approval modals immediately
- **Visual confirmation:** Saving indicator during auto-save
- **Seamless workflow:** No extra steps to sync between tabs
- **Clear messaging:** Users know changes sync automatically

## Technical Benefits

### Data Integrity
- Single source of truth (proposal_settings table)
- Automatic recalculation prevents drift
- No stale data between views
- Consistent deposit amounts across all interfaces

### Performance
- Debounced saves prevent database spam
- Only saves changed fields
- Efficient RPC function for recalculation
- Minimal network overhead

### Maintainability
- Reusable BillingConfigSummary component
- Consistent auto-save pattern across components
- Clear separation of concerns
- Well-documented code

## Testing Recommendations

1. **Basic Sync Test**
   - Change deposit type in Billing tab
   - Open approval modal
   - Verify settings match

2. **Reverse Sync Test**
   - Change deposit in approval modal
   - Return to Billing tab
   - Verify changes reflected

3. **Auto-Save Test**
   - Make rapid changes in Billing tab
   - Verify debouncing works (saves after 1 second)
   - Check save indicator appears

4. **Calculated Values Test**
   - Set deposit to 50%
   - Verify amount calculated correctly
   - Change proposal total
   - Verify deposit amount updates

5. **Edge Cases**
   - Test with $0 proposals
   - Test with custom amounts exceeding total
   - Test switching between deposit types rapidly
   - Test with network delays

## Migration Notes

- No database migrations required
- Existing proposal_settings records work as-is
- Auto-save is additive - doesn't break existing save flows
- Backward compatible with existing workflows

## Summary

This implementation provides seamless bidirectional synchronization between the Billing tab and all approval workflows. Sales reps can now confidently edit deposit and payment settings in either location, knowing changes will immediately reflect everywhere. The collapsed UI keeps approval modals clean while still providing full editing capability when needed.

Key achievement: **Zero-click synchronization** - changes save and sync automatically without any manual intervention.
