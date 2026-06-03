# Proposal Approval System - Fixed

## What Was Wrong

The proposal billing and approval system had **multiple conflicting triggers** trying to distinguish between "manual" and "portal" approvals, causing:

1. **Race conditions** - Multiple triggers attempting to process the same approval
2. **Double processing** - Sales orders and invoices being created multiple times
3. **Inconsistent behavior** - Manual vs portal approvals following different logic
4. **Confusing statuses** - `approved_pending_action` status causing workflow confusion

### The Core Problem
The system incorrectly assumed manual and portal approvals needed different handling, when in reality **both should follow the same workflow** based on the proposal settings.

## What Was Fixed

### 1. Removed Conflicting Triggers
Dropped these outdated triggers:
- `trigger_create_sales_order_from_proposal` (original, Nov 2025)
- `trigger_set_proposal_pending_action` (added Jan 20, 2026)
- `trigger_handle_proposal_approval_automatic` (added Jan 20, 2026)

### 2. Simplified Status Workflow
**New Status Flow:**
```
draft → sent → viewed → approved
```

**Removed statuses:**
- `designing` (converted to `draft`)
- `ready_to_submit` (converted to `draft`)
- `approved_pending_action` (removed from normal workflow)

### 3. Created Unified Approval System
**Single trigger:** `trigger_unified_proposal_approval`
- Handles ALL approvals the same way (manual AND portal)
- Uses proposal settings as the single source of truth
- No distinction between approval types

## How It Works Now

When a proposal status changes to `approved`, the system **automatically** handles everything based on the proposal settings:

### Approval Scenarios

#### 1. Purchase Order Approval
- **When:** `accepted_via_method = 'purchase_order'`
- **Action:**
  - Create sales order with status `planning`
  - No invoice created (PO customers get net payment terms)
  - Validates PO number exists

#### 2. Deposit Required + Not Paid Yet
- **When:** `require_deposit = true` AND `deposit_paid = false`
- **Action:**
  - Create deposit invoice with status `sent`
  - Create sales order with status `pending_deposit`
  - Set `deposit_request_sent = true`

#### 3. Deposit Already Paid
- **When:** `require_deposit = true` AND `deposit_paid = true`
- **Action:**
  - Create deposit invoice with status `paid`
  - Create payment record
  - Create sales order with status `planning` (ready to schedule)

#### 4. No Deposit Required
- **When:** `require_deposit = false`
- **Action:**
  - Create sales order with status `planning`
  - No invoice created

## How Sales Reps Use It

### Manual Approval (In Person)
1. Sales rep sits with customer
2. Customer agrees to proposal
3. Sales rep clicks "Approve" or uses the ApprovalActionModal
4. System automatically:
   - Creates sales order
   - Creates invoice (if deposit required)
   - Sends to appropriate status based on settings

### Portal Approval (Remote)
1. Customer logs into portal
2. Customer approves proposal
3. System automatically:
   - Creates sales order
   - Creates invoice (if deposit required)
   - Notifies sales rep
   - Sends to appropriate status based on settings

### Edge Cases - ApprovalActionModal
The `ApprovalActionModal` is still available for edge cases where the sales rep needs to:
- Override the deposit amount
- Add a PO number after the fact
- Manually adjust the billing flow

But for normal operations, **just approving the proposal is enough** - the system handles the rest based on the proposal settings.

## Key Benefits

1. **Consistent Behavior** - Manual and portal approvals work the same way
2. **No Manual Steps** - Sales reps don't need to remember to "take action" after approval
3. **Settings-Driven** - All billing logic comes from proposal settings
4. **No Race Conditions** - Single trigger handles all scenarios
5. **Automatic Notifications** - Sales reps automatically notified when customers approve

## Database Changes

Migration: `20260126XXXXXX_fix_unified_proposal_approval_workflow.sql`

**Changes:**
- Dropped conflicting triggers and functions
- Simplified status constraint to 6 core statuses
- Created `handle_unified_proposal_approval()` function
- Updated all existing proposals to new status system
- Cleaned up `approved_pending_action` proposals

## Testing Checklist

- [ ] Manual approval with deposit required
- [ ] Manual approval with PO
- [ ] Manual approval with no deposit
- [ ] Portal approval with deposit required
- [ ] Portal approval with PO
- [ ] Portal approval with no deposit
- [ ] Verify sales order creation
- [ ] Verify invoice creation
- [ ] Verify notifications sent
- [ ] Verify no duplicate processing

## Notes

- The old `handle_deposit_billing_action()`, `handle_po_acceptance_action()`, and `handle_no_deposit_action()` functions are still available for edge cases but are no longer called by the trigger
- Sales reps can still use the ApprovalActionModal if they need to override the automatic behavior
- The system is now much simpler and more predictable
