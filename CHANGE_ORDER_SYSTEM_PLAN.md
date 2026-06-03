# Change Order System - Comprehensive Implementation Plan

## Executive Summary

Change Orders are modifications to Sales Orders that allow tracking additions, deletions, or changes to the original contract scope. This plan outlines a complete Change Order system tied to Sales Orders and Projects.

---

## Current State Analysis

### What Exists
- Basic `change_orders` table with project linkage
- Financial tracking (original amount, change amount, new total)
- Approval workflow (draft, pending, approved, rejected)
- Change order numbering (CO-YYYY-#####)
- Basic UI for viewing and approving

### What's Missing
- **Sales Order Integration**: Not tied to sales orders
- **Line Item Detail**: No breakdown of what's being added/removed
- **Scope Documentation**: Limited description field only
- **Proposal Integration**: No way to create new proposals from changes
- **Version History**: No tracking of modifications to change orders
- **Financial Impact**: No tax calculations, no impact on invoicing
- **Document Generation**: No PDF generation
- **Multi-level Approval**: Single approval only
- **Notification System**: No automated alerts
- **Project Impact**: No auto-update of project budgets

---

## Proposed Architecture

### 1. Database Schema

#### Enhanced `change_orders` Table
```sql
- sales_order_id (uuid, FK to sales_orders) -- PRIMARY LINK
- project_id (uuid, FK to projects) -- Secondary link
- change_order_number (text, unique) -- CO-##-##### format
- revision_number (integer) -- Track revisions (CO-01-00001-R1)
-
- type (text) -- 'addition', 'deletion', 'modification', 'credit'
- status (text) -- 'draft', 'pending_approval', 'approved', 'rejected', 'cancelled'
-
- original_contract_amount (numeric) -- From sales order
- change_amount (numeric) -- Net change (+ or -)
- new_contract_total (numeric) -- Updated total
- tax_amount (numeric) -- Sales tax on change
-
- title (text)
- description (text) -- Customer-facing description
- internal_notes (text) -- Internal team notes
- reason (text) -- Why change is needed
-
- requested_by (uuid, FK to profiles)
- requested_date (timestamptz)
- approved_by (uuid, FK to profiles)
- approval_date (timestamptz)
- rejection_reason (text)
-
- requires_new_proposal (boolean) -- Generate proposal for customer
- proposal_id (uuid, FK to proposals) -- Link to generated proposal
- customer_approved (boolean) -- Customer acceptance required
- customer_approved_date (timestamptz)
- customer_signature_url (text) -- Signed document
-
- estimated_labor_hours_change (numeric)
- estimated_material_cost_change (numeric)
- estimated_completion_date_change (interval) -- Days added/removed
```

#### New `change_order_line_items` Table
```sql
CREATE TABLE change_order_line_items (
  id uuid PRIMARY KEY,
  change_order_id uuid FK NOT NULL,

  action_type text NOT NULL, -- 'add', 'remove', 'modify_quantity', 'modify_price'

  -- Product reference
  product_id uuid FK, -- If using catalog product
  product_name text NOT NULL,
  product_description text,

  -- Original values (for modifications)
  original_quantity numeric,
  original_unit_price numeric,
  original_total numeric,

  -- New values
  new_quantity numeric NOT NULL,
  new_unit_price numeric NOT NULL,
  new_total numeric NOT NULL,

  -- Change amount (calculated)
  change_amount numeric NOT NULL, -- Difference between old and new

  -- Labor phase
  labor_phase_id uuid FK,
  labor_phase_name text,

  -- Installation details
  install_location text, -- Room/area
  tech_notes text,

  sort_order integer,
  created_at timestamptz
);
```

#### New `change_order_approvals` Table (Multi-level)
```sql
CREATE TABLE change_order_approvals (
  id uuid PRIMARY KEY,
  change_order_id uuid FK NOT NULL,

  approval_level integer NOT NULL, -- 1, 2, 3 (sequential)
  approver_role text NOT NULL, -- 'project_manager', 'office_manager', 'admin', 'customer'
  approver_id uuid FK, -- Specific person or null for role-based

  status text NOT NULL, -- 'pending', 'approved', 'rejected', 'skipped'
  approved_date timestamptz,
  rejection_reason text,
  notes text,

  required boolean DEFAULT true, -- Can some levels be optional?

  created_at timestamptz
);
```

#### New `change_order_history` Table
```sql
CREATE TABLE change_order_history (
  id uuid PRIMARY KEY,
  change_order_id uuid FK NOT NULL,

  action text NOT NULL, -- 'created', 'submitted', 'approved', 'rejected', 'modified', 'cancelled'
  performed_by uuid FK NOT NULL,
  description text,

  -- Snapshot of state before change
  snapshot jsonb,

  created_at timestamptz
);
```

#### New `change_order_documents` Table
```sql
CREATE TABLE change_order_documents (
  id uuid PRIMARY KEY,
  change_order_id uuid FK NOT NULL,

  document_type text NOT NULL, -- 'proposal', 'approval_form', 'signed_contract', 'supporting_doc'
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  mime_type text,

  uploaded_by uuid FK NOT NULL,
  created_at timestamptz
);
```

---

### 2. Workflow Process

#### Stage 1: Creation
1. User selects Sales Order to modify
2. System loads current sales order with line items
3. User adds/removes/modifies line items
4. System calculates:
   - Change amount (+ or -)
   - New contract total
   - Tax impact
   - Labor hour changes
5. User enters reason and internal notes
6. Save as DRAFT

#### Stage 2: Submission
1. User submits for approval
2. System creates approval records based on rules:
   - < $500: Project Manager only
   - $500-$5000: Project Manager + Office Manager
   - > $5000: Project Manager + Office Manager + Customer signature
3. Notifications sent to approvers
4. Status: PENDING_APPROVAL

#### Stage 3: Internal Approval
1. Approvers review in sequence
2. Each level can:
   - Approve (moves to next level)
   - Reject (returns to requester with reason)
   - Request modifications
3. Notifications at each step

#### Stage 4: Customer Approval (if required)
1. System generates proposal/addendum PDF
2. Email sent to customer with secure link
3. Customer reviews and signs electronically
4. System records signature and approval date

#### Stage 5: Execution
1. All approvals complete
2. System automatically:
   - Updates sales_order.contract_total
   - Creates change_order_line_items as additions to project
   - Updates project budget
   - Notifies production team
   - Creates activity feed events
3. Status: APPROVED

#### Stage 6: Project Impact
1. New line items appear in work order planning
2. Materials added to procurement lists
3. Timeline updated if completion date changes
4. Budget tracking reflects new totals

---

### 3. Business Rules

#### Approval Thresholds (Configurable)
```javascript
{
  tier1: { max: 500, approvers: ['project_manager'] },
  tier2: { max: 5000, approvers: ['project_manager', 'office_manager'] },
  tier3: { max: Infinity, approvers: ['project_manager', 'office_manager', 'customer'] }
}
```

#### Change Order Types

**Addition**
- Adding new products/services
- Change amount is positive (+)
- Requires customer approval if > threshold
- Example: Customer adds 2 more rooms

**Deletion**
- Removing products/services (credit)
- Change amount is negative (-)
- Always requires customer approval
- Creates credit that can be:
  - Refunded
  - Applied to invoice balance
  - Used for additions

**Modification**
- Changing quantities or specifications
- Can be + or -
- Example: Change from Product A to Product B

**Net Zero Changes**
- Swapping equivalent value items
- Change amount = $0
- May still require approval for scope change

---

### 4. UI Components

#### Main Change Orders View
- List of all change orders
- Filter by: Status, Sales Order, Project, Date Range
- Quick stats: Pending ($X), Approved This Month ($Y)
- Search by CO number, customer, description

#### Create/Edit Change Order Form
**Step 1: Sales Order Selection**
- Dropdown of active sales orders
- Shows: SO#, Customer, Current Total
- Loads current line items

**Step 2: Line Item Modifications**
- Three-column view:
  - Current Items (from SO)
  - Changes (add/remove/modify)
  - New Items (result)
- Action buttons:
  - Add New Line Item
  - Modify Existing Item
  - Remove Item
- Real-time totals update

**Step 3: Details**
- Title (required)
- Description (customer-facing)
- Reason dropdown + text
- Internal notes
- Upload supporting documents

**Step 4: Review & Submit**
- Summary of all changes
- Financial breakdown:
  ```
  Current Contract Total:     $10,000.00
  Change Amount:              + $2,500.00
  Subtotal:                   $12,500.00
  Sales Tax (8%):            +   $200.00
  New Contract Total:         $12,700.00
  ```
- Approval path shown
- Submit or Save as Draft

#### Approval Interface
- Pending approvals dashboard
- View change order details
- Compare before/after
- Approve/Reject/Request Changes buttons
- Comments section

#### Customer Portal View
- Clean, branded interface
- Change order details
- Line items in simple table
- Electronic signature pad
- Approve/Decline buttons

---

### 5. Integration Points

#### Sales Orders
- Change order updates SO total on approval
- SO history tracks all COs
- SO line items include CO additions

#### Projects
- CO items flow into work order planning
- Budget updates automatically
- Timeline adjustments reflected

#### Proposals
- Can generate addendum proposal from CO
- Customer signs proposal = CO approval
- Proposal line items become CO line items

#### Invoicing
- CO approved = available for invoicing
- Credits from deletions appear on invoices
- Progress billing reflects new total

#### Inventory
- CO additions added to material pull lists
- Warehouse notified of new items
- Procurement updated for special orders

---

### 6. Calculations

#### Change Amount Calculation
```
For each line item:
  if action = 'add':
    change_amount = new_quantity × new_unit_price

  if action = 'remove':
    change_amount = -(original_quantity × original_unit_price)

  if action = 'modify':
    old_total = original_quantity × original_unit_price
    new_total = new_quantity × new_unit_price
    change_amount = new_total - old_total

Total Change Amount = sum(all line items change_amount)
```

#### Tax Calculation
```
if change_amount > 0:
  tax_amount = change_amount × applicable_tax_rate
else:
  tax_amount = 0 (no tax on credits)
```

#### New Contract Total
```
new_contract_total = original_contract_amount + change_amount + tax_amount
```

---

### 7. Notifications

#### Trigger Points
1. CO Submitted → Notify first approver
2. CO Approved (level) → Notify next approver
3. CO Fully Approved → Notify requester, production team
4. CO Rejected → Notify requester with reason
5. CO Requires Customer Approval → Email customer
6. Customer Approves → Notify sales rep, production

#### Notification Content
- CO number and title
- Customer name
- Change amount
- Reason for change
- Action required
- Link to view/approve

---

### 8. Reporting

#### Key Reports
1. **Change Order Summary Report**
   - Total COs by status
   - Total dollar value of changes
   - Average approval time
   - Top reasons for changes

2. **Change Order Impact Report**
   - Project profitability impact
   - Timeline impact
   - Resource allocation changes

3. **Approval Velocity Report**
   - Time at each approval stage
   - Bottleneck identification
   - Approver performance

4. **Customer Change Frequency**
   - Which customers request most changes
   - Common change patterns
   - Upsell opportunities

---

### 9. Security & Permissions

#### Role Permissions

**Technician**
- Cannot create COs
- Can view COs for assigned work orders

**Project Manager**
- Create COs for own projects
- Approve COs up to tier 1 threshold
- View all COs for own projects

**Office Manager**
- Create COs for any project
- Approve COs up to tier 2 threshold
- View all COs in office

**Admin**
- Full access to all COs
- Override any approval
- Configure approval rules

**Customer (Portal)**
- View COs for their projects
- Approve COs requiring their signature
- Download CO documents

---

### 10. Edge Cases & Validation

#### Validations
- Cannot create CO for completed projects
- Cannot modify approved CO (must create revision)
- Cannot delete items not in original SO
- Total cannot go negative
- Labor hours cannot exceed realistic limits
- Must have at least one line item

#### Edge Cases
1. **Multiple COs in Flight**
   - Base each new CO on current approved total
   - Queue COs if conflict detected

2. **CO Rejected After Partial Work**
   - Track work completed
   - Create credit for unused materials
   - Adjust hours in time tracking

3. **Customer Cancellation After CO**
   - Mark CO as cancelled
   - Do not update SO
   - Track reason for reporting

4. **SO Already Invoiced**
   - CO creates separate invoice line items
   - Clearly marked as "Change Order"
   - References original invoice

---

### 11. Implementation Phases

#### Phase 1: Core Schema (Week 1)
- Create tables
- Add foreign keys and indexes
- Set up RLS policies
- Write basic CRUD functions

#### Phase 2: Line Items & Calculations (Week 2)
- Build line item management
- Implement calculation engine
- Test financial accuracy
- Add validation rules

#### Phase 3: Approval Workflow (Week 3)
- Create approval tables
- Build multi-level approval logic
- Implement notifications
- Create approval UI

#### Phase 4: Sales Order Integration (Week 4)
- Link COs to SOs
- Auto-update SO on approval
- Test data consistency
- Add rollback capability

#### Phase 5: UI Components (Week 5-6)
- Create CO form
- Build approval interface
- Add list/filter views
- Implement customer portal view

#### Phase 6: Document Generation (Week 7)
- PDF templates
- Email delivery
- E-signature integration
- Document storage

#### Phase 7: Reporting & Polish (Week 8)
- Build standard reports
- Add dashboard widgets
- Performance optimization
- User training materials

---

### 12. Success Metrics

#### User Adoption
- % of scope changes tracked as COs
- Time to create CO (target: < 5 minutes)
- User satisfaction score

#### Process Efficiency
- Average approval time (target: < 24 hours)
- % of COs approved on first submission
- Number of approval bottlenecks

#### Business Impact
- Total value of approved changes
- Change order profit margin
- Customer satisfaction with change process
- Reduction in scope creep

---

### 13. Migration Strategy

#### Data Migration
1. Review existing change_orders
2. Map to new schema
3. Create line items from descriptions (manual if needed)
4. Preserve approval history
5. Link to sales orders (backfill)

#### User Transition
1. Run both systems in parallel for 2 weeks
2. Train users on new workflow
3. Migrate active COs first
4. Archive old system
5. Monitor and support

---

## Conclusion

This comprehensive Change Order system provides:
- **Traceability**: Full audit trail of all changes
- **Accuracy**: Detailed line item tracking and calculations
- **Efficiency**: Streamlined approval workflows
- **Compliance**: Proper documentation and signatures
- **Integration**: Seamless connection to sales orders and projects
- **Visibility**: Real-time reporting and dashboards

By implementing this system, the organization will have complete control over scope changes, protect profitability, and improve customer satisfaction through transparent change management.
