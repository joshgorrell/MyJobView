# Test & Tune Bonus System - User Assignment Guide

## How Users Get Bonuses

### Overview
The Test & Tune bonus system assigns bonuses to two roles per project:
1. **Lead Technician** (receives 65% of the bonus pool)
2. **Project Manager** (receives 35% of the bonus pool)

If the same person holds both roles, they receive 100% of the bonus.

---

## Assignment Methods

### 1. Lead Technician Assignment

The Lead Technician is assigned at the **Sales Order level** when a proposal is approved:

**Database Field:**
- **Table:** `sales_orders`
- **Column:** `lead_technician_id` (uuid, references profiles)

**When to Assign:**
- When a proposal is approved and converted to a sales order
- During sales order creation or editing
- Before starting the Test & Tune period

**Who Can Assign:**
- Admin
- Finance
- Sales Manager
- Production Manager

### 2. Project Manager Assignment

The Project Manager is assigned when the **bonus calculation is created** at Day 90:

**Database Field:**
- **Table:** `test_tune_bonus_calculations`
- **Column:** `project_manager_id` (uuid, references profiles)

**When Assigned:**
- Automatically at Day 90 evaluation (if set on sales order)
- Manually during bonus calculation review
- Can be updated by Finance/Admin before approval

---

## Who Can See Bonuses

### Viewing Permissions (RLS Policy)

Users can see bonuses in the "My Bonuses" tab if:

1. **They are assigned to the bonus:**
   - Their user ID matches `lead_technician_id`, OR
   - Their user ID matches `project_manager_id`

2. **They have management access:**
   - Admin
   - Finance
   - Production Manager
   - Sales Manager
   - Office Manager

### Implementation Details
```sql
-- From RLS policy (line 313-324 in migration)
CREATE POLICY "Staff can view bonus calculations"
  ON test_tune_bonus_calculations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'finance', 'production_manager', 'sales_manager', 'office_manager')
    )
    OR lead_technician_id = auth.uid()
    OR project_manager_id = auth.uid()
  );
```

---

## Step-by-Step Assignment Process

### Step 1: Create Sales Order with Lead Tech
When a proposal is approved:
1. Go to **Sales Orders** view
2. Open the sales order
3. Assign the **Lead Technician** field
4. This technician will be eligible for the 65% bonus portion

### Step 2: Start Test & Tune Period
1. Set `test_tune_start_date` on the sales order
2. Set `test_tune_status` to `'active'`
3. System calculates `test_tune_end_date` (start date + 90 days)

### Step 3: Track Work Orders
During the 90-day period:
1. Work orders must have **labor_category_id** assigned:
   - **Field Labor** - Counts toward performance target
   - **PM Labor** - Tracked separately
   - **Non-Performance Labor** - Doesn't count toward target

### Step 4: Day 90 Evaluation
On Day 90 (automatically or manually):
1. System creates bonus calculation record
2. Copies `lead_technician_id` from sales order
3. Sets `project_manager_id` (from sales order or manual entry)
4. Calculates bonus amounts based on labor efficiency

### Step 5: Bonus Approval
Finance/Admin reviews:
1. Verify lead technician assignment
2. Verify project manager assignment
3. Approve, deny, or adjust bonus amounts
4. Mark as `approved` or `denied`

### Step 6: Payment
When bonus is paid:
1. Update status to `'paid'`
2. Users see the bonus in their "My Bonuses" tab
3. Amount is added to their "Total Earned" stat

---

## UI Components for Assignment

### Sales Order Detail Page
**Location:** `src/components/Sales/SalesOrderDetail.tsx`

**Add Lead Technician Selector:**
```tsx
{/* Lead Technician Assignment */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Lead Technician (Test & Tune Bonus)
  </label>
  <select
    value={salesOrder.lead_technician_id || ''}
    onChange={(e) => updateLeadTechnician(e.target.value)}
    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
  >
    <option value="">Select Lead Technician...</option>
    {technicians.map(tech => (
      <option key={tech.id} value={tech.id}>
        {tech.full_name}
      </option>
    ))}
  </select>
  <p className="text-xs text-gray-500 mt-1">
    This technician will receive 65% of performance bonuses
  </p>
</div>
```

### Bonus Approval Dashboard
**Location:** `src/components/Finance/BonusApprovalDashboard.tsx`

**Already includes PM assignment during review:**
- Displays current lead technician and PM assignments
- Allows Finance/Admin to update assignments before approval
- Shows split (65% tech / 35% PM) or 100% if same person

---

## Database Queries for Assignment

### Get Users Eligible for Bonuses
```sql
-- Get all technicians (for lead tech dropdown)
SELECT id, full_name, role
FROM profiles
WHERE role IN ('technician', 'production_manager', 'service_manager')
  AND active = true
ORDER BY full_name;

-- Get all project managers (for PM dropdown)
SELECT id, full_name, role
FROM profiles
WHERE role IN ('production_manager', 'sales_manager', 'office_manager', 'admin')
  AND active = true
ORDER BY full_name;
```

### Assign Lead Technician to Sales Order
```sql
UPDATE sales_orders
SET lead_technician_id = '<user_id>',
    updated_at = now()
WHERE id = '<sales_order_id>';
```

### Assign PM to Bonus Calculation
```sql
UPDATE test_tune_bonus_calculations
SET project_manager_id = '<user_id>',
    updated_at = now()
WHERE id = '<bonus_calculation_id>'
  AND status = 'provisional'; -- Only before approval
```

### Check User's Bonuses
```sql
SELECT
  b.*,
  so.order_number,
  c.full_name as contact_name,
  lt.full_name as lead_tech_name,
  pm.full_name as pm_name
FROM test_tune_bonus_calculations b
JOIN sales_orders so ON so.id = b.sales_order_id
JOIN contacts c ON c.id = so.contact_id
LEFT JOIN profiles lt ON lt.id = b.lead_technician_id
LEFT JOIN profiles pm ON pm.id = b.project_manager_id
WHERE b.lead_technician_id = '<user_id>'
   OR b.project_manager_id = '<user_id>'
ORDER BY b.evaluation_date DESC;
```

---

## Common Scenarios

### Scenario 1: Technician Works Alone
- **Lead Technician:** John Smith (assigned)
- **Project Manager:** Jane Doe (assigned)
- **Result:** John gets 65%, Jane gets 35%

### Scenario 2: Tech is Also PM
- **Lead Technician:** John Smith (assigned)
- **Project Manager:** John Smith (same person)
- **Result:** John gets 100%

### Scenario 3: Multiple Techs (Split Not Supported)
Currently, the system supports ONE lead technician per project:
- Assign the primary/lead technician
- Other technicians don't receive bonuses from this system
- Consider manual adjustments in approval process if needed

### Scenario 4: Change Assignment Before Approval
If you need to change who gets the bonus:
1. Go to **Bonus Approval Dashboard** (Finance role required)
2. Find the provisional bonus
3. Update Lead Technician and/or Project Manager
4. Recalculate bonus amounts (65/35 split)
5. Approve the updated bonus

---

## Troubleshooting

### User Can't See Their Bonuses
**Check:**
1. Is the user's ID in `lead_technician_id` OR `project_manager_id`?
2. Is the bonus status `'provisional'`, `'approved'`, or `'paid'`?
3. Does the user have an active account?

**Query to verify:**
```sql
SELECT
  b.id,
  b.status,
  b.lead_technician_id,
  b.project_manager_id,
  p.id as user_id,
  p.full_name,
  p.role
FROM test_tune_bonus_calculations b
CROSS JOIN profiles p
WHERE p.id = '<user_id>'
  AND (b.lead_technician_id = '<user_id>' OR b.project_manager_id = '<user_id>');
```

### Bonus Not Created at Day 90
**Check:**
1. Is `test_tune_status` = `'active'` on sales order?
2. Is `test_tune_end_date` reached?
3. Is `auto_evaluate_enabled` = true in `test_tune_settings`?
4. Are there completed work orders with labor hours?

### Wrong Person Assigned Bonus
**Fix (before approval):**
1. Finance/Admin can update assignments
2. Go to Bonus Approval Dashboard
3. Edit the bonus calculation
4. Update `lead_technician_id` or `project_manager_id`
5. Save and approve

**Fix (after approval):**
1. Admin can create adjustment record in `test_tune_bonus_approvals`
2. Mark original as `'denied'`
3. Create new bonus calculation with correct assignments
4. Document reason in `override_reason`

---

## API/Frontend Integration

### Get Bonuses for Current User
```typescript
const { data: bonuses } = await supabase
  .from('test_tune_bonus_calculations')
  .select(`
    *,
    sales_orders!inner(order_number, contact_id),
    contacts!sales_orders_contact_id_fkey(full_name)
  `)
  .or(`lead_technician_id.eq.${userId},project_manager_id.eq.${userId}`)
  .order('evaluation_date', { ascending: false });
```

### Update Lead Technician on Sales Order
```typescript
const { error } = await supabase
  .from('sales_orders')
  .update({ lead_technician_id: selectedTechId })
  .eq('id', salesOrderId);
```

### Update PM on Bonus Calculation
```typescript
const { error } = await supabase
  .from('test_tune_bonus_calculations')
  .update({ project_manager_id: selectedPMId })
  .eq('id', bonusId)
  .eq('status', 'provisional'); // Only before approval
```

---

## Security Notes

- Only Finance and Admin can modify bonus assignments
- RLS policies enforce who can view bonuses
- All changes are logged in `test_tune_bonus_history`
- Users cannot assign bonuses to themselves
- Bonus amounts are recalculated when assignments change

---

## Quick Reference

| Action | Required Role | Table | Field |
|--------|---------------|-------|-------|
| Assign Lead Tech | Sales Manager | `sales_orders` | `lead_technician_id` |
| Assign PM | Finance/Admin | `test_tune_bonus_calculations` | `project_manager_id` |
| View Own Bonuses | Any (if assigned) | `test_tune_bonus_calculations` | Match user ID |
| Approve Bonuses | Finance/Admin | `test_tune_bonus_calculations` | Set status to `approved` |
| Pay Bonuses | Finance/Admin | `test_tune_bonus_calculations` | Set status to `paid` |

---

## Need Help?

If you need to:
- **Add bonus assignment UI** to Sales Orders → See example code above
- **Bulk assign technicians** → Create admin tool with dropdown
- **Change bonus splits** → Update `test_tune_settings` table (65/35 default)
- **Add more roles** → Update RLS policies to include additional roles
