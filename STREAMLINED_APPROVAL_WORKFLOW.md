# Streamlined Proposal Approval Workflow

This document describes the new unified proposal approval workflow that centralizes control with the sales rep and prevents duplicate customer notifications.

## Overview

The previous approval process was messy with notifications scattered across multiple systems, unclear state transitions, and no centralized control. The new workflow provides:

1. **Centralized Sales Rep Control** - Sales rep explicitly chooses the next action after approval
2. **No Duplicate Notifications** - Tracks all notifications to prevent duplicate emails
3. **Clear Workflow States** - Linear progression from approval to action to completion
4. **Unified Interface** - Single modal for all approval actions with clear previews

## Architecture

### Database Schema

#### New Table: `proposal_notifications`
Tracks all customer notifications to prevent duplicates:
- Stores notification type, recipient, timestamp, and metadata
- Indexed for fast duplicate checking
- RLS policies restrict to authenticated users

#### New Proposal Fields
- `billing_action_taken` - Whether sales rep has chosen an action
- `billing_action_type` - Type of action taken (deposit_invoice, purchase_order, no_deposit_required)
- `billing_action_at` - Timestamp of action
- `billing_action_by` - User who took the action
- `customer_notified` - Whether customer was notified
- `customer_notified_at` - When customer was notified

#### New Proposal Status
- `approved_pending_action` - Proposal approved but waiting for sales rep to choose billing action

### Database Functions

#### `check_duplicate_notification(proposal_id, notification_type, hours_window)`
Checks if a notification of the given type was already sent within the time window.

#### `record_proposal_notification(...)`
Records a sent notification and updates proposal customer_notified fields.

#### `handle_deposit_billing_action(proposal_id, send_notification)`
Explicitly creates deposit invoice and sales order when sales rep requests deposit payment:
- Creates sales order with status `pending_deposit`
- Creates invoice with status `sent`
- Records notification if requested
- Returns invoice_id and sales_order_id

#### `handle_po_acceptance_action(proposal_id, po_number, po_file_url, send_notification)`
Finalizes PO acceptance:
- Validates PO is allowed and no deposit required
- Creates sales order with status `planning` (ready to schedule)
- Records PO details
- NO invoice created (PO customers on net terms)

#### `handle_no_deposit_action(proposal_id, send_notification)`
Completes approval for proposals with no deposit or PO:
- Creates sales order with status `planning`
- Records notification if requested

### Modified Trigger

The old `create_sales_order_from_proposal()` trigger that automatically created sales orders and invoices has been replaced with `set_proposal_pending_action()`:

- When status changes to `approved`, sets status to `approved_pending_action`
- Sales rep MUST explicitly call one of the action functions
- Prevents automatic invoice creation
- Gives sales rep full control

## User Interface

### 1. ApprovalActionModal

The main modal that appears when a proposal reaches `approved_pending_action` status:

**Features:**
- Shows 3 action cards based on proposal configuration:
  - **Request Deposit Payment** - If deposit required
  - **Add Purchase Order** - If PO is allowed and no deposit
  - **Complete Approval** - If no deposit required
- Each card shows:
  - Clear description of action
  - List of what will happen next
  - Required inputs (PO number for PO action)
- Checkbox to send notification (checked by default)
- Shows duplicate notification warning if email sent recently
- Displays recent notification history

**Post-Action Flow:**
- For deposit requests: Shows secondary screen with two options
  - "Email Invoice to Customer" - Sends email immediately
  - "Copy Portal Link" - Copies link for manual sharing
  - "Skip - I'll notify manually" - No email sent
- For PO/No Deposit: Shows success confirmation

### 2. PendingApprovalActionsWidget

Dashboard widget shown on the Proposals page:

**Features:**
- Shows all proposals with status `approved_pending_action`
- Color-coded urgency (red if 4+ hours, yellow if 2+ hours, blue if recent)
- Displays:
  - Proposal number and customer name
  - Time since approval
  - Total and deposit amounts
  - Urgency indicator
- One-click action buttons:
  - "Bill Deposit" - Opens action modal
  - "Add PO" - Opens action modal
  - "Complete" - Opens action modal
- Shows total deposit value across all pending proposals
- Real-time updates via Supabase subscriptions

### 3. ProposalNotificationHistory

Component to view all notifications sent for a proposal:

**Features:**
- Lists all notifications with timestamps
- Shows notification type, recipient, method (email/SMS/portal)
- Displays metadata (invoice_id, amounts, etc.)
- Color-coded by notification type
- Relative timestamps ("2h ago") with absolute on hover
- Can be shown as modal or inline

**Access:**
- Available in proposal builder via "More Options" menu
- Shows notification history for transparency

### 4. Integration with Existing Components

**ProposalBuilderCompact:**
- Added notification history menu item
- Manual approval button now checks proposal status
- Shows `ApprovalActionModal` if status is `approved_pending_action`
- Shows legacy `ManualApprovalModal` for other statuses

**ProposalsView:**
- Shows `PendingApprovalActionsWidget` at top of proposals list
- Widget auto-updates as proposals are approved

## Email Function Updates

### send-invoice-email Edge Function

Updated to support deduplication and tracking:

**New Parameters:**
- `proposalId` - Link invoice to proposal
- `skipDuplicateCheck` - Force send even if recently sent

**New Logic:**
1. Check for duplicate notifications (if proposalId provided)
2. Return 409 error if duplicate found (unless skip flag set)
3. Send email as before
4. Record notification in tracking table

**Error Response:**
```json
{
  "error": "Duplicate notification",
  "message": "An invoice email was already sent for this proposal within the last 24 hours. Set skipDuplicateCheck=true to send anyway."
}
```

## Workflow Flow

### Customer Approval (Portal)
1. Customer views proposal and clicks "Approve"
2. Customer selects approval method (Payment/PO/Verbal)
3. Proposal status changes to `approved_pending_action`
4. Sales rep receives in-app notification

### Sales Rep Action (Admin)
1. Sales rep sees proposal in "Pending Approval Actions" widget
2. Clicks action button (Bill Deposit/Add PO/Complete)
3. `ApprovalActionModal` opens showing options
4. Sales rep reviews what will happen
5. Sales rep confirms action (with optional notification)

### Deposit Billing Path
1. `handle_deposit_billing_action()` called
2. Creates invoice and sales order
3. Shows secondary screen with email options
4. Sales rep can:
   - Send email immediately
   - Copy portal link for manual sharing
   - Skip and notify customer later
5. If email sent, records notification
6. Proposal status changes to `approved`
7. Sales order status is `pending_deposit`

### PO Path
1. `handle_po_acceptance_action()` called
2. Sales rep enters PO number and optional file
3. Creates sales order with status `planning`
4. NO invoice created (PO customers on net terms)
5. Optional confirmation email to customer
6. Records notification if sent
7. Project ready for scheduling

### No Deposit Path
1. `handle_no_deposit_action()` called
2. Creates sales order with status `planning`
3. Optional confirmation email
4. Records notification if sent
5. Project ready for scheduling

## Notification Deduplication

### How It Works
1. Before sending any notification, check `proposal_notifications` table
2. Look for same notification type within time window (default 24 hours)
3. If found, show warning or block (depending on context)
4. After sending, record in tracking table

### Benefits
- Prevents multiple deposit request emails
- Shows sales rep when customer was last contacted
- Provides audit trail of all communications
- Can override if truly needed (skipDuplicateCheck flag)

## Key Improvements

### 1. No More Automatic Actions
- Old: Proposal approval triggered automatic invoice creation
- New: Sales rep explicitly chooses action
- Benefit: Full control, no surprises

### 2. Single Customer Email
- Old: Multiple systems could send duplicate emails
- New: Centralized tracking prevents duplicates
- Benefit: Better customer experience

### 3. Clear State Machine
- Old: Unclear when/why things happened
- New: Explicit states and transitions
- Benefit: Predictable, debuggable

### 4. Sales Rep Dashboard
- Old: No visibility into pending actions
- New: Widget shows all proposals awaiting action
- Benefit: Nothing falls through cracks

### 5. Notification Transparency
- Old: No record of what was sent when
- New: Complete history viewable
- Benefit: Team coordination, accountability

## Migration Notes

### Existing Proposals
- Proposals with status `approved` are unaffected
- Only NEW approvals go through new workflow
- Old trigger is disabled, new trigger is active

### Backward Compatibility
- Legacy `ManualApprovalModal` still works for direct sales rep approvals
- New modal shown only for `approved_pending_action` status
- No breaking changes to existing functionality

## Testing Checklist

- [ ] Customer approves proposal via portal
- [ ] Proposal appears in pending actions widget
- [ ] Sales rep clicks "Bill Deposit"
- [ ] Modal shows correct options based on proposal settings
- [ ] Invoice is created when deposit action taken
- [ ] Email can be sent from secondary screen
- [ ] Notification is recorded in database
- [ ] Duplicate check prevents second email within 24 hours
- [ ] Notification history shows all sent emails
- [ ] PO path creates sales order without invoice
- [ ] No deposit path creates sales order immediately
- [ ] Widget updates in real-time
- [ ] Build completes without errors

## Future Enhancements

1. **SMS Notifications** - Extend tracking to SMS messages
2. **Template Selection** - Let sales rep choose email template
3. **Scheduled Sends** - Queue notifications for later
4. **Customer Preferences** - Honor customer notification preferences
5. **Reminder Automation** - Auto-send deposit reminders after X days
6. **Analytics** - Track notification effectiveness

## Technical Details

### Performance
- Indexes added for fast pending proposal queries
- RLS policies optimized with auth helper functions
- Real-time subscriptions for live updates

### Security
- All actions require authentication
- RLS prevents unauthorized access
- Notification records immutable after creation

### Scalability
- Notification table partitionable by date
- Can add notification methods without schema changes
- Extensible to other entity types (invoices, work orders, etc.)

## Files Changed

### Database
- `20260120170000_create_unified_proposal_approval_workflow.sql`

### Frontend Components
- `ApprovalActionModal.tsx` (new)
- `PendingApprovalActionsWidget.tsx` (new)
- `ProposalNotificationHistory.tsx` (new)
- `ProposalBuilderCompact.tsx` (updated)
- `ProposalsView.tsx` (updated)

### Edge Functions
- `send-invoice-email/index.ts` (updated)

## Conclusion

The new streamlined approval workflow provides sales reps with full control over the post-approval process, prevents duplicate notifications, and creates a clear audit trail. The centralized action modal makes it obvious what options are available and what will happen for each choice, while the pending actions widget ensures nothing is forgotten.
