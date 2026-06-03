# Proposal Approval and Sales Order Conversion System

## Overview

This document explains the complete proposal approval workflow, including customer self-service approval via the portal and manual approval by sales reps.

## Approval Methods

### 1. Customer Self-Service Approval (Portal)

Customers can approve proposals through their customer portal using two methods:

#### A. Payment Method
- Customer pays the required deposit amount
- System marks `deposit_paid = true`
- System records `deposit_payment_date`
- Proposal automatically converts to sales order

#### B. Purchase Order Method
- Customer enters their PO number
- Customer can optionally upload PO document
- System stores PO number in `purchase_order_number`
- System stores uploaded file URL in `purchase_order_file_url`
- Proposal automatically converts to sales order

**Customer Approval Flow:**
1. Customer opens proposal in portal
2. Customer clicks "Approve Proposal"
3. Modal shows acceptance methods based on proposal settings
4. Customer selects method and provides required information
5. System validates requirements
6. Proposal status changes to "approved"
7. Trigger automatically creates sales order
8. Sales rep receives notification

**Component:** `ProposalApprovalModal.tsx`

---

### 2. Manual Approval by Sales Rep

Sales reps can manually approve proposals on behalf of customers with flexible options for deposit handling.

#### Approval Methods Available to Sales Reps:

**A. Verbal/In-Person Approval**
- Customer approved verbally or in person
- No immediate deposit required
- Can send deposit request to customer after approval

**B. Purchase Order Received**
- Customer provided PO number
- PO document can be uploaded
- Deposit may still be required separately

**C. Payment Already Received**
- Deposit has been collected
- Marks deposit as paid immediately

#### Deposit Handling Options:

Sales reps have two options for handling deposits:

1. **Deposit Already Received**
   - Check this if customer already paid
   - Sets `deposit_paid = true`
   - Records `deposit_payment_date`
   - No email sent

2. **Send Deposit Request**
   - Check this to email customer for deposit
   - Sets `deposit_request_sent = true`
   - Records `deposit_request_sent_at`
   - Sends automated deposit request email
   - Allows approval even without deposit

**Manual Approval Flow:**
1. Sales rep opens proposals list
2. Finds proposal with status "sent" or "viewed"
3. Clicks menu (three dots) → "Manual Approve"
4. Modal opens with approval options
5. Sales rep selects acceptance method
6. Sales rep handles deposit (received or request)
7. Sales rep adds optional notes
8. System validates requirements
9. Proposal status changes to "approved"
10. Sales order is automatically created
11. Customer receives approval notification

**Component:** `ManualApprovalModal.tsx`

---

## Proposal-Level Acceptance Configuration

Sales reps configure acceptance methods **per proposal** in the Proposal Settings. This gives flexibility to customize requirements for each customer and situation.

### Configuration Options:

**Require Deposit Toggle:**
- ON: Customer must pay deposit or provide PO to approve
- OFF: Customer can approve without payment

**Acceptance Methods** (can select one or both):
- **Payment Only**: Customer MUST pay deposit to approve (most common)
- **Payment OR Purchase Order**: Customer can choose either method

**Deposit Type:**
- Percentage of total
- Parts total (all materials)
- Custom fixed amount
- None (PO only)

### How It Works:

1. Sales rep creates proposal
2. In Proposal Settings → Deposit tab
3. Configure acceptance methods for this specific proposal
4. Customer sees only the methods allowed for their proposal
5. System validates based on proposal-specific settings

**Example Scenarios:**

- **Residential customer, no PO:** Set to "Payment Only" + 50% deposit
- **Commercial customer with PO:** Set to "Payment OR Purchase Order" + Parts Total deposit
- **Government contract:** Set to "Purchase Order Only" + No deposit requirement

---

## Database Schema

### Proposals Table Fields

```sql
-- Core approval fields
status text CHECK (status IN ('draft', 'sent', 'viewed', 'approved', 'declined'))
approved_by uuid REFERENCES auth.users(id)
approval_completed_at timestamptz
approval_notes text

-- Proposal-level acceptance configuration (overrides template)
acceptance_methods text[] DEFAULT ARRAY['payment']::text[]
require_deposit boolean DEFAULT true

-- Acceptance method tracking
accepted_via_method text CHECK (accepted_via_method IN ('payment', 'purchase_order', 'verbal'))

-- Deposit tracking
deposit_paid boolean DEFAULT false
deposit_payment_date timestamptz
deposit_request_sent boolean DEFAULT false
deposit_request_sent_at timestamptz
deposit_amount_due numeric

-- Purchase order tracking
purchase_order_number text
purchase_order_file_url text

-- Invoice tracking
deposit_invoice_id uuid REFERENCES invoices(id)

-- Sales order link
sales_order_id uuid REFERENCES sales_orders(id)
```

### Invoices Table Fields

```sql
id uuid PRIMARY KEY
company_id uuid
proposal_id uuid REFERENCES proposals(id)  -- Links invoice to proposal
contact_id uuid REFERENCES contacts(id)
invoice_number text
invoice_type text CHECK (invoice_type IN ('deposit', 'progress', 'final', 'standard'))
invoice_date date
due_date date
total numeric
amount_paid numeric
amount_due numeric
status text CHECK (status IN ('draft', 'sent', 'paid', 'partial', 'overdue', 'void'))
qbo_invoice_id text  -- QuickBooks Online sync
synced_at timestamptz
```

---

## Automatic Sales Order Creation & Invoice Generation

When a proposal is approved (by any method), a database trigger automatically:

1. **Validates** that acceptance requirements are met (uses proposal-level settings)
2. **Creates Deposit Invoice** (if payment method used and deposit > $0)
   - Invoice number format: INV-##### (sequential)
   - Invoice type: "deposit"
   - Status: "sent" (ready for payment)
   - Links to proposal via `proposal_id`
   - Links to customer via `contact_id`
   - Visible to sales rep who created proposal
3. **Generates** sales order number (converts PRO-XX-XXXXX to SO-XX-XXXXX)
4. **Creates** new sales order with status "planning"
5. **Copies** proposal data to sales order
6. **Links** sales order back to proposal
7. **Notifies** sales rep via activity feed
8. **Emails** customer confirmation

**Database Trigger:** `create_sales_order_from_proposal()`

**Validation Function:** `check_proposal_acceptance_requirements()`

**Invoice Generation:** `create_deposit_invoice_from_proposal()`

---

## Change Order System

Once a proposal is converted to a sales order, the original approved scope is locked. Any modifications must go through the change order system:

### Change Order Workflow:

1. **Sales order exists** - Original proposal is now immutable
2. **Change needed** - Create change order for modifications
3. **Document changes** - Track what changed and why
4. **Get approval** - Change orders require approval
5. **Update pricing** - Adjust contract total if needed
6. **Track history** - Full audit trail of all changes

**Benefits:**
- Original approved scope preserved
- Clear documentation of all changes
- Customer approval on modifications
- Price adjustment tracking
- Complete audit trail
- Dispute resolution support

**Component:** `ChangeOrdersView.tsx`

---

## Requirements Validation

The system validates approval requirements based on proposal settings:

### Validation Rules:

1. **No Deposit Required**
   - Approval always allowed
   - No additional checks needed

2. **Deposit Required - Payment Method**
   - Must have `deposit_paid = true` OR
   - Must have `deposit_request_sent = true` (manual approval)

3. **Deposit Required - Purchase Order Method**
   - Must have `purchase_order_number` populated
   - Deposit may still be required separately

4. **Deposit Required - Verbal Method**
   - Always allowed for manual approvals
   - Used when sales rep approves on behalf of customer

### Flexible Approval Logic:

Sales reps can approve proposals even if deposit hasn't been received by:
- Setting `deposit_request_sent = true`
- System sends deposit request email to customer
- Customer can pay deposit later through portal
- Sales order created immediately to start planning

---

## Status Flow

```
draft → sent → viewed → approved
                   ↓
                declined
```

**Draft:** Being worked on by sales rep
**Sent:** Sent to customer portal
**Viewed:** Customer opened and viewed proposal
**Approved:** Customer or sales rep approved
**Declined:** Customer declined the proposal

---

## UI Components

### ProposalsView.tsx
Main view for managing all proposals

### ProposalsList.tsx
List of proposals with filtering and actions
- Shows "Manual Approve" button for sent/viewed proposals
- Three-dot menu on each proposal row

### ManualApprovalModal.tsx
Modal for sales rep to manually approve proposal
- Acceptance method selection
- Deposit handling options
- Notes field
- What happens next summary

### ProposalApprovalModal.tsx
Modal for customer to approve proposal in portal
- Shows only methods allowed in proposal settings
- Handles payment or PO submission
- Clear instructions and confirmation

### ChangeOrdersView.tsx
Interface for managing change orders on approved sales orders

---

## Email Templates

The system sends automated emails:

1. **Proposal Approved (Customer)**
   - Sent when customer approves via portal
   - Confirms approval and next steps
   - Thanks customer for their business

2. **Proposal Approved (Sales Rep Notification)**
   - Sent when customer approves
   - Notifies sales rep of approval
   - Includes sales order number

3. **Deposit Request**
   - Sent when sales rep sends deposit request
   - Includes deposit amount
   - Link to customer portal for payment
   - Payment instructions

4. **Manual Approval Confirmation**
   - Sent when sales rep manually approves
   - Confirms approval on customer's behalf
   - Includes sales order number
   - Next steps for customer

---

## Invoice Management

### Automatic Invoice Creation:

When a proposal is approved with deposit payment:
1. System creates deposit invoice automatically
2. Invoice includes deposit amount from proposal
3. Invoice status set to "sent"
4. Links to both proposal and customer
5. Syncs to QuickBooks Online (if integrated)

### Viewing Invoices:

**Sales Reps:**
- View all invoices for their proposals
- See invoice in proposal builder
- Track payment status
- Access from customer contact record

**Customers:**
- View invoices in customer portal
- See payment history
- Download PDF invoices
- Pay online (if integrated)

**Component:** `ProposalInvoices.tsx`

---

## Key Features

### For Customers:
- ✅ Self-service approval via portal
- ✅ See only allowed payment methods
- ✅ Upload purchase orders
- ✅ Clear confirmation messages
- ✅ Automatic notifications
- ✅ View invoices in portal

### For Sales Reps:
- ✅ **Configure acceptance per proposal**
- ✅ Manual approval capability
- ✅ Flexible deposit handling
- ✅ Send deposit requests
- ✅ **Automatic invoice creation**
- ✅ Add approval notes
- ✅ Immediate sales order creation
- ✅ **View all customer invoices**

### For Business:
- ✅ Original scope protection
- ✅ Change order tracking
- ✅ Complete audit trail
- ✅ **Automatic deposit invoicing**
- ✅ Automated workflows
- ✅ **QuickBooks Online sync ready**
- ✅ Reduced manual work

---

## Security

- RLS policies protect all proposal data
- Only proposal owner and customer can approve
- Sales reps can manually approve any proposal
- Deposit amounts are validated
- All changes logged with timestamps
- Approved proposals are immutable (changes via change orders)

---

## Best Practices

### For Sales Reps:

1. **Use Manual Approve When:**
   - Customer approved verbally
   - Customer approved in person
   - Customer sent PO via email
   - Quick approval needed

2. **Send Deposit Requests When:**
   - Customer hasn't paid yet
   - You want to start planning immediately
   - Customer needs payment instructions
   - Deposit will be collected later

3. **Add Notes When:**
   - Recording approval circumstances
   - Documenting special agreements
   - Explaining deposit arrangements
   - Noting follow-up needed

### For Implementation:

1. **Always create change orders** for approved proposals
2. **Never modify** approved proposal line items directly
3. **Document all changes** in change order notes
4. **Get customer approval** for change orders
5. **Track price adjustments** separately

---

## Related Documentation

- `CHANGE_ORDER_SYSTEM_PLAN.md` - Change order details
- `MYJOBVIEW_IMPLEMENTATION.md` - Customer portal
- `PROPOSAL_LUXURY_CANVAS.md` - Proposal builder
- `SECURITY_CONTRACTS_IMPLEMENTATION_PLAN.md` - Contract system
