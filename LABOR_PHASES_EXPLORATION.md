# Labor Phases, Line Items, and Task Completion Tracking - Codebase Exploration

## 1. LABOR_PHASES TABLE STRUCTURE

**Location**: `/tmp/cc-agent/63173967/project/supabase/migrations/20251122031300_20251122_create_warehouse_enhancements.sql`

**Table Fields**:
```sql
CREATE TABLE labor_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,                    -- Phase name (e.g., "Rough-In", "Trim", "Programming")
  description text,                              -- What this phase includes
  default_rate numeric DEFAULT 0,               -- Default hourly rate for this phase
  sort_order integer DEFAULT 0,                 -- Display order
  is_active boolean DEFAULT true,               -- Whether phase is in use
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Default Phases** (seeded):
- Rough-In (hourly rate: $125.00, sort order: 1)
- Trim (hourly rate: $125.00, sort order: 2)
- Programming (hourly rate: $150.00, sort order: 3)
- Training (hourly rate: $150.00, sort order: 4)
- Service (hourly rate: $175.00, sort order: 5)
- Project Management (hourly rate: $200.00, sort order: 6)

**Indexes**:
- `idx_labor_phases_active` on (is_active, sort_order)

**RLS Policies**:
- Authenticated users can view active labor phases (is_active = true)
- Only admins can manage labor phases

---

## 2. PROPOSAL_LINE_ITEMS TABLE STRUCTURE

**Key Fields Related to Labor Phases and Task Tracking**:

### Labor Phase Fields:
```sql
labor_phase_id uuid REFERENCES labor_phases(id) ON DELETE SET NULL
  -- Added in: 20251201222125_add_labor_phase_id_to_line_items.sql
  -- Allows assigning a labor phase to a line item
  
labor_phases LaborPhase (relationship)
  -- Foreign object containing the labor_phases data
  -- Contains: id, name, description, default_rate, sort_order
```

### Task Notes / Completion Fields:
```sql
task_notes text
  -- Added in: 20251122031300_create_warehouse_enhancements.sql
  -- Internal technician notes for this line item
  -- NOT customer-facing by default
  
show_task_notes boolean DEFAULT false
  -- Added in: 20251201164805_add_proposal_visibility_toggles.sql
  -- Changed to DEFAULT false in: 20260105185859_change_show_task_notes_default_to_false.sql
  -- Controls whether task_notes are visible to customers
  
is_hidden boolean DEFAULT false
  -- Added in: 20251122031300_create_warehouse_enhancements.sql
  -- Hides line item from customer view completely
```

### Labor-Related Fields:
```sql
labor_hours numeric(10,2)
  -- Hours needed for this line item
  
labor_rate numeric(10,2) DEFAULT 0
  -- Hourly rate for labor
  
labor_total numeric(10,2) DEFAULT 0
  -- Calculated total (labor_hours * labor_rate)
  
item_type text DEFAULT 'material' 
  -- CHECK (item_type IN ('labor', 'material', 'both'))
  -- Type of line item
  
is_taxable boolean DEFAULT true
  -- Whether this item is subject to tax
```

### Other Key Fields:
```sql
id uuid PRIMARY KEY
parent_item_id uuid REFERENCES proposal_line_items
  -- For nested/accessory items
  
product_id uuid REFERENCES products
  -- Links to product master data
  
room_id uuid REFERENCES proposal_rooms
  -- Which room/area this item belongs to
  
description text
quantity numeric
unit text
unit_price numeric
line_total numeric
sort_order integer
display_mode text ('itemized' | 'bundle' | 'collapsed')
class_id uuid REFERENCES proposal_classes
  -- Product classification
  
created_at timestamptz
updated_at timestamptz
```

**Important**: There is NO `is_completed`, `completed_at`, or `task_status` field on proposal_line_items.

---

## 3. MULTI-PHASE LABOR SUPPORT TABLES

### A. product_labor_phases
**Location**: `/tmp/cc-agent/63173967/project/supabase/migrations/20251129171004_add_product_labor_phases.sql`

**Purpose**: Allows products to have multiple labor phases with different hours

```sql
CREATE TABLE product_labor_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  labor_phase_id uuid NOT NULL REFERENCES labor_phases(id) ON DELETE CASCADE,
  hours numeric NOT NULL DEFAULT 0,          -- Hours for this phase
  sort_order integer NOT NULL DEFAULT 0,     -- Ordering of multiple phases
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Use Case**: When a product requires multiple labor phases (e.g., rough-in + trim)

**Indexes**:
- `idx_product_labor_phases_product_id`
- `idx_product_labor_phases_labor_phase_id`
- `idx_product_labor_phases_sort_order`

---

### B. proposal_line_item_labor_phases
**Location**: `/tmp/cc-agent/63173967/project/supabase/migrations/20251129171444_add_line_item_labor_phase_notes.sql`

**Purpose**: Multi-phase tech notes per line item (internal-only notes per phase)

```sql
CREATE TABLE proposal_line_item_labor_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id uuid NOT NULL REFERENCES proposal_line_items(id) ON DELETE CASCADE,
  labor_phase_id uuid NOT NULL REFERENCES labor_phases(id) ON DELETE CASCADE,
  hours numeric NOT NULL DEFAULT 0,          -- Hours for this phase
  tech_notes text,                           -- Internal notes for THIS phase only
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Key Point**: `tech_notes` are NEVER shown to customers - internal technician use only

**Indexes**:
- `idx_line_item_labor_phases_line_item`
- `idx_line_item_labor_phases_labor_phase`
- `idx_line_item_labor_phases_sort_order`

---

## 4. TASK COMPLETION TRACKING

**Important Finding**: Proposal line items themselves do NOT have completion tracking fields.

**Task Completion is tracked in related tables**:

### A. work_order_tasks
**Location**: `/tmp/cc-agent/63173967/project/supabase/migrations/20251117160732_create_production_department_schema.sql`

```sql
CREATE TABLE work_order_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text DEFAULT 'pending',                              -- pending, in_progress, completed
  estimated_hours numeric DEFAULT 0,
  actual_hours numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  completed_at timestamptz,                                   -- Tracks completion time
  created_at timestamptz
);
```

**Status Values**: pending | in_progress | completed

### B. punch_list_items
**Location**: `/tmp/cc-agent/63173967/project/supabase/migrations/20251117160732_create_production_department_schema.sql`

```sql
CREATE TABLE punch_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punch_list_id uuid REFERENCES punch_lists(id) ON DELETE CASCADE,
  description text NOT NULL,
  status text DEFAULT 'pending',                              -- pending, completed, failed
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  priority text DEFAULT 'medium',
  notes text,
  completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,                                   -- Tracks completion time
  sort_order integer DEFAULT 0,
  created_at timestamptz
);
```

**Status Values**: pending | completed | failed

### C. project_tasks (Inferred from proposal line items)
**Location**: Auto-generated from proposal line items with task_notes

Line items with `task_notes` and `show_task_notes = true` become tasks in the project workflow.

---

## 5. EXISTING REPORT/PRINT VIEWS

### A. ProposalTaxReport
**File**: `/tmp/cc-agent/63173967/project/src/components/Proposals/ProposalTaxReport.tsx`

**Purpose**: Detailed tax breakdown for proposals
- Shows line items separated by taxability
- Displays tax calculations per item
- Integrated into ProposalBuilderCompact

**Features**:
- Tax rate lookup by ZIP code
- Considers tax environment (residential/commercial)
- Project type classification

---

### B. ClassSummaryReport
**File**: `/tmp/cc-agent/63173967/project/src/components/Proposals/ClassSummaryReport.tsx`

**Purpose**: Breaks down proposal by product class (speakers, displays, wiring, labor, etc.)
- Groups line items by class_id
- Shows totals per class
- Print-friendly modal interface
- Includes unclassified items

**Usage**: Accessed from SalesOrderReportsTab for product categorization

---

### C. SalesOrderReportsTab
**File**: `/tmp/cc-agent/63173967/project/src/components/Sales/SalesOrderReportsTab.tsx`

**Report Types Supported**:
1. **Financial Summary** - Contract totals, change orders, billing & payments
2. **Change Order Reports** - Lists all change orders with status and amounts
3. **Class Summary** - Product classification breakdown (via ClassSummaryReport)
4. **Project Stats** - Work order data, hours, completion status
5. **Product List** - All materials used
6. **Project Reports** - Generated via Edge Functions

**Edge Function Integration**:
- Calls Supabase Edge Functions to generate PDF/HTML reports
- URL: `${VITE_SUPABASE_URL}/functions/v1/{slug}`
- Functions exist in `/supabase/functions/`

---

### D. WarehousePick
**File**: `/tmp/cc-agent/63173967/project/src/components/Inventory/WarehousePick.tsx`

**Purpose**: Pick list generation for approved proposals
- Lists approved proposals
- Generates material picking lists
- Tracks quantity needed vs picked
- Warehouse bin location support
- Barcode scanning support

**Features**:
- Loads proposals in 'approved' status
- Groups by product and warehouse
- Supports bin location tracking
- Real-time picking status

---

### E. ReportBuilder
**File**: `/tmp/cc-agent/63173967/project/src/components/Reports/ReportBuilder.tsx`

**Purpose**: Generic report builder for standard metrics

**Supported Report Types**:
- sales
- revenue
- proposals
- appointments
- commissions
- contacts

**Export Formats**: CSV, PDF

**Grouping Options**: day, week, month, year, user, office

---

## 6. PROPOS ALBUILDERCOMPACT LABOR PHASE RENDERING

**File**: `/tmp/cc-agent/63173967/project/src/components/Proposals/ProposalBuilderCompact.tsx`

### Key Implementation Details:

#### Column Structure:
```typescript
interface LineItemColumns {
  labor_phase_id?: string | null;           // UUID of assigned labor phase
  labor_phases?: LaborPhase | null;          // Populated relationship
  task_notes?: string | null;                // Technician notes
  show_task_notes?: boolean;                 // Customer visibility
  is_hidden?: boolean;                       // Hide from customer
}
```

#### Rendering (Lines 2700-2730):
```typescript
// Grouped by labor phase name
const phaseName = item.labor_phases?.name || 'Unassigned';
const phaseId = item.labor_phase_id || 'unassigned';

// Items are filtered and grouped:
displayItems = displayItems.filter(item => 
  item.labor_phases?.name && filters.phases.includes(item.labor_phases.name)
);

// Extract unique phases for filtering
const uniquePhases = rooms
  .flatMap(r => r.line_items.map(item => item.labor_phases?.name))
  .filter(Boolean);
```

#### State Management:
```typescript
const [showLaborPhase, setShowLaborPhase] = useState(false);  // Line 920
```

#### Data Queries:
```typescript
// Line 1209: Query includes labor_phases relationship
.select('id, name, description, unit_price, cost, unit, item_type, is_taxable, labor_phase_id')

// Line 1209 continued:
labor_phases:labor_phase_id (id, name, description, default_rate, sort_order)
```

#### Form Handling:
```typescript
// Line 4137-4145: Labor phase picker in edit form
<input
  value={item.labor_phase_id || ''}
  onChange={(e) => updateLineItem(item.id, 'labor_phase_id', newValue || null)}
/>
```

---

## 7. TYPE DEFINITIONS

**Location**: `/tmp/cc-agent/63173967/project/src/lib/types.ts`

### LaborPhase Interface (Lines 301-307):
```typescript
export interface LaborPhase {
  id: string;
  name: string;
  description?: string | null;
  default_rate?: number | null;
  sort_order?: number;
}
```

### ProposalLineItem Interface (Lines 398-428):
```typescript
export interface ProposalLineItem {
  id: string;
  proposal_id: string;
  room_id: string | null;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  cost: number | null;
  line_total: number;
  sort_order: number;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
  products?: Product;
  
  labor_hours?: number | null;
  labor_rate?: number | null;
  labor_total?: number | null;
  item_type?: string | null;
  
  task_notes?: string | null;                   // Internal notes
  parent_item_id?: string | null;
  display_mode?: 'itemized' | 'bundle' | 'collapsed';
  accessories?: ProposalLineItem[];
  
  show_task_notes?: boolean;                    // Customer visibility
  is_hidden?: boolean;                          // Hide from customer
  labor_phase_id?: string | null;               // Labor phase assignment
  labor_phases?: LaborPhase | null;             // Populated relationship
  class_id?: string | null;
  is_taxable?: boolean;
}
```

---

## 8. NAVIGATION & ROUTING STRUCTURE

### Adding New Report Views:

#### A. Main App Router
**File**: `/tmp/cc-agent/63173967/project/src/App.tsx`

**Pattern**: Lazy-loaded components from respective module folders

```typescript
const SalesOrderReportsTab = lazy(() => 
  import('./components/Sales/SalesOrderReportsTab')
);
```

#### B. Module Navigation
**File**: `/tmp/cc-agent/63173967/project/src/components/Layout/DepartmentSidebar.tsx`

**Structure**:
- Main departments (Sales, Production, Inventory, etc.)
- Footer departments (Finance, Admin, etc.)
- Module-level navigation within each department
- Starred modules for quick access

#### C. How to Add a New Report:

1. **Create Report Component**:
   - Location: `/src/components/{Department}/{ReportName}.tsx`
   - Example: `/src/components/Production/LaborPhaseReport.tsx`

2. **Register in DepartmentContext**:
   - Add to modules table in database
   - Or hardcode in module definitions
   - Assign to appropriate department

3. **Add Route in App.tsx**:
   - Lazy load the component
   - Add to routing logic

4. **Link from Parent Component**:
   - Add button/link in parent (e.g., SalesOrderDetail, ProposalBuilderCompact)
   - Navigate using state or router

#### Example Pattern (from ProposalBuilderCompact):
```typescript
// State
const [showTaxReport, setShowTaxReport] = useState(false);

// Trigger
<button onClick={() => setShowTaxReport(true)}>Tax Report</button>

// Render
{showTaxReport && (
  <ProposalTaxReport
    proposalId={proposalId}
    onClose={() => setShowTaxReport(false)}
  />
)}
```

---

## 9. SUMMARY OF KEY FINDINGS

### Labor Phase Assignment:
✓ Implemented and active
- Labor phases are master data with default rates
- Products can have multiple phases (via product_labor_phases)
- Line items can have single phase assignment (labor_phase_id)
- Line item phases can have individual tech notes (proposal_line_item_labor_phases)

### Task Completion Tracking:
✓ Implemented but separate from proposal line items
- Completion happens at work_order_task and punch_list_item level
- Not directly on proposal_line_items
- Design: proposals are quotes, tasks are execution

### Task Notes / Visibility:
✓ Fully implemented
- `task_notes`: Internal technician notes
- `show_task_notes`: Toggle customer visibility (DEFAULT false)
- `is_hidden`: Completely hide line item from customer

### Existing Reports:
✓ Multiple report views already exist
- ProposalTaxReport: Tax breakdown
- ClassSummaryReport: Product classification
- SalesOrderReportsTab: Financial & project reports
- WarehousePick: Inventory picking
- ReportBuilder: Generic dashboard reports

### No "Phase Report" / "Pick List" Type Views:
⚠ Found WarehousePick for inventory, but no labor-phase-specific "install report"
- Could create: Labor Phase Summary Report (hours by phase, technician assignments)
- Could create: Phase Readiness Checklist (which phases complete, which pending)
- Could create: Phase-based Work Order Generation

---

## 10. FILE PATHS SUMMARY

### Key Source Files:
- `/tmp/cc-agent/63173967/project/src/lib/types.ts` - Type definitions
- `/tmp/cc-agent/63173967/project/src/components/Proposals/ProposalBuilderCompact.tsx` - Main proposal editor
- `/tmp/cc-agent/63173967/project/src/components/Sales/SalesOrderReportsTab.tsx` - Report hub
- `/tmp/cc-agent/63173967/project/src/components/Proposals/ProposalTaxReport.tsx` - Tax report
- `/tmp/cc-agent/63173967/project/src/components/Proposals/ClassSummaryReport.tsx` - Classification report
- `/tmp/cc-agent/63173967/project/src/components/Inventory/WarehousePick.tsx` - Pick list generation
- `/tmp/cc-agent/63173967/project/src/components/Admin/LaborPhaseManagement.tsx` - Labor phase admin

### Key Migration Files:
- `20251122031300_create_warehouse_enhancements.sql` - labor_phases table
- `20251129171004_add_product_labor_phases.sql` - Multi-phase product support
- `20251129171444_add_line_item_labor_phase_notes.sql` - Multi-phase line item notes
- `20251201222125_add_labor_phase_id_to_line_items.sql` - Line item labor phase assignment
- `20251201164805_add_proposal_visibility_toggles.sql` - Task note visibility
- `20260105185859_change_show_task_notes_default_to_false.sql` - Visibility default

