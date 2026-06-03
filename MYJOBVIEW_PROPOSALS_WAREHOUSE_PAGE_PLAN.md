# MyJobView Proposals & Warehouse - Page Modification Plan

## Current System Analysis Complete ✅

### Existing Structure

**5 Departments:**
1. **Pipeline** - Lead management, connections, discussions
2. **Sales** - Proposals, sales orders, performance
3. **Production** - Projects, work orders, parts, tech work
4. **Dispatch** - Scheduling, tech tracking, travel bonus
5. **Finance** - Invoices, billing, commissions, recurring revenue
6. **Admin** - Settings, users, permissions, integrations

**Current Roles:**
- `admin` - Full access
- `sales` - Sales and pipeline access
- (Others exist but these are the two main ones in use)

**Current Permission System:**
- ✅ `departments` table with 6 departments
- ✅ `department_modules` table with 60+ modules
- ✅ `roles` table with predefined roles
- ✅ `role_department_access` for role-based department access
- ✅ `role_module_access` for role-based module access
- ✅ `user_permission_overrides` for per-user exceptions

---

## Integration Strategy - Using Existing Pages & Navigation

### ✅ ZERO New Departments - Use Existing Structure

Instead of creating new departments, we'll enhance existing modules within **Sales** and **Production** departments.

---

## Page Modifications - Detailed Plan

### 1. PROPOSALS MODULE (Sales Department)

**Current State:**
- Module: `proposals` in **Sales** department
- Component: `ProposalsView.tsx`
- Shows list of proposals with ability to create/edit
- Has multiple builder views: Standard, Condensed, AllRooms, Enhanced

**Modifications:**

#### A) Enhance ProposalsView.tsx
**Location:** `/src/components/Proposals/ProposalsView.tsx`

**Changes:**
- ✅ Add layout toggle: "Classic View" vs "Pro Grid View"
- ✅ Keep existing list view as default
- ✅ Add new "Pro Grid View" option that launches ProposalBuilderPro
- ✅ Store user preference in `user_column_preferences` table

**New UI Elements:**
- Toggle button in top-right: `[Classic] [Pro Grid]`
- Button saves preference per user
- No breaking changes - classic view remains default

#### B) Create NEW Component: ProposalBuilderPro.tsx
**Location:** `/src/components/Proposals/ProposalBuilderPro.tsx` (NEW FILE)

**What It Does:**
- Dense, editable grid interface (power-user view)
- Live bidirectional calculations (margin ↔ price)
- Drag-and-drop row reordering
- Floating product detail cards
- Column show/hide preferences
- All the advanced features from the spec

**Uses Existing Data:**
- ✅ Same `proposals` table
- ✅ Same `proposal_rooms` table (these are "Areas")
- ✅ Same `proposal_line_items` table
- ✅ Same `products` table
- ✅ Adds optional enhancement fields only

**Permissions:**
- Same as existing proposals module
- No new permissions needed
- Available to anyone who can access proposals

---

### 2. WAREHOUSE MODULE (Production Department)

**Current State:**
- Module: `products_catalog` exists (Products & Inventory)
- Component: `ProductsManagement.tsx` and `InventoryDashboard.tsx`
- Basic product and inventory management

**Modifications:**

#### A) Enhance InventoryDashboard.tsx
**Location:** `/src/components/Inventory/InventoryDashboard.tsx`

**Changes:**
- ✅ Add tabs: `[Dashboard] [Receive] [Pick] [Transfer] [Stock Levels]`
- ✅ Keep existing dashboard as default tab
- ✅ Add new tabs for warehouse operations

**New Components Created:**

1. **WarehouseReceive.tsx** (NEW)
   - Location: `/src/components/Inventory/WarehouseReceive.tsx`
   - Barcode scanning for receiving
   - Uses existing `purchase_orders` and `product_inventory` tables
   - Creates `stock_movements` for audit trail

2. **WarehousePick.tsx** (NEW)
   - Location: `/src/components/Inventory/WarehousePick.tsx`
   - Pick items for jobs/proposals
   - Barcode scan-out
   - Uses existing `proposals`, `proposal_line_items`, `product_inventory`
   - Creates `stock_reservations` entries

3. **WarehouseTransfer.tsx** (NEW)
   - Location: `/src/components/Inventory/WarehouseTransfer.tsx`
   - Transfer stock between warehouses
   - Uses existing `warehouses`, `product_inventory`, `stock_transfers` tables

4. **StockLevels.tsx** (NEW)
   - Location: `/src/components/Inventory/StockLevels.tsx`
   - Enhanced view with bins, serial/lot tracking
   - Uses existing `product_inventory` table
   - Shows new `warehouse_bins` and `serial_lot_tracking` data

**Permissions:**
- Uses existing module permissions for `products_catalog`
- No new module needed - just enhanced functionality
- Role-based access via existing `role_module_access` table

---

### 3. PRODUCT SEARCH ENHANCEMENT (Multiple Locations)

**Current State:**
- `ProductSelector.tsx` exists in `/src/components/Proposals/`
- Used in proposals for adding products

**Modifications:**

#### A) Enhance ProductSelector.tsx
**Location:** `/src/components/Proposals/ProductSelector.tsx`

**Changes:**
- ✅ Add Portal.io integration
- ✅ Show real-time dealer pricing
- ✅ Show current stock levels (all warehouses)
- ✅ Show stock by warehouse + bin
- ✅ Enhanced search with thumbnails
- ✅ Product comparison feature

**Uses Existing Data:**
- ✅ Same `products` table
- ✅ Existing `portal_io_product_id` and `portal_io_data` fields
- ✅ Existing `product_inventory` table
- ✅ Adds optional `portal_io_cache` table for performance

**Permissions:**
- Same as current - anyone who can create proposals

---

### 4. INTEGRATIONS (Admin Department)

**Current State:**
- Module: `integrations` exists in **Admin** department
- Component: Settings.tsx with IntegrationsSettings.tsx tab
- Has QuickBooks integration already

**Modifications:**

#### A) Enhance IntegrationsSettings.tsx
**Location:** `/src/components/Admin/IntegrationsSettings.tsx`

**Changes:**
- ✅ Add section: "Portal.io Integration"
  - API Key field
  - Test connection button
  - Last sync timestamp
  - Manual sync button

- ✅ Add section: "Control4 Integration"
  - OAuth connect button
  - Connected account info
  - Disconnect button

**Permissions:**
- Same as existing integrations module
- Admin only (already enforced)

---

## Files to Be Created (All New - No Modifications)

### New Components

```
src/components/Proposals/
  ProposalBuilderPro.tsx          ← NEW (power-user grid)
  ProposalGridRow.tsx             ← NEW (grid row component)
  ProposalDetailCard.tsx          ← NEW (floating product card)

src/components/Inventory/
  WarehouseReceive.tsx            ← NEW (receive screen)
  WarehousePick.tsx               ← NEW (picking screen)
  WarehouseTransfer.tsx           ← NEW (transfer screen)
  StockLevels.tsx                 ← NEW (enhanced stock view)
  BarcodeScanner.tsx              ← NEW (camera scanning)

src/components/Integrations/
  PortalioService.tsx             ← NEW (Portal.io API)
  Control4Integration.tsx         ← NEW (Control4 OAuth)

src/lib/
  portalio.ts                     ← NEW (API client)
  control4.ts                     ← NEW (API client)
  barcode.ts                      ← NEW (barcode utilities)
```

### New Edge Functions

```
supabase/functions/
  portal-io-sync/index.ts         ← NEW (Portal.io sync)
  portal-io-product-search/index.ts ← NEW (search products)
  control4-oauth-start/index.ts   ← NEW (OAuth initiate)
  control4-oauth-callback/index.ts ← NEW (OAuth callback)
  control4-import-project/index.ts ← NEW (import devices)
  control4-export-c4z/index.ts    ← NEW (export project)
```

---

## Files to Be Modified (Existing)

### Component Modifications

**1. ProposalsView.tsx**
- **Location:** `/src/components/Proposals/ProposalsView.tsx`
- **Changes:**
  - Add view toggle (Classic vs Pro Grid)
  - Add state management for view preference
  - Conditional render: ProposalsList OR ProposalBuilderPro
- **Risk:** Low - additive only, no breaking changes

**2. ProductSelector.tsx**
- **Location:** `/src/components/Proposals/ProductSelector.tsx`
- **Changes:**
  - Integrate Portal.io search
  - Show stock levels from product_inventory
  - Enhanced UI with thumbnails
  - Add comparison feature
- **Risk:** Low - enhances existing component

**3. InventoryDashboard.tsx**
- **Location:** `/src/components/Inventory/InventoryDashboard.tsx`
- **Changes:**
  - Add tab navigation
  - Import and render new warehouse components
  - Keep existing dashboard as first tab
- **Risk:** Low - wraps existing functionality

**4. IntegrationsSettings.tsx**
- **Location:** `/src/components/Admin/IntegrationsSettings.tsx`
- **Changes:**
  - Add Portal.io settings section
  - Add Control4 settings section
- **Risk:** Low - additive only

**5. App.tsx**
- **Location:** `/src/App.tsx`
- **Changes:**
  - Add route cases for new warehouse tabs (if needed)
  - Import new components
- **Risk:** Low - additive only

---

## Database Changes - All Additive

### New Tables (Zero Existing Tables Modified)

```sql
-- All new tables, existing tables untouched
CREATE TABLE warehouse_bins (...);
CREATE TABLE serial_lot_tracking (...);
CREATE TABLE stock_reservations (...);
CREATE TABLE product_classes (...);
CREATE TABLE labor_phases (...);
CREATE TABLE user_column_preferences (...);
CREATE TABLE portal_io_cache (...);
CREATE TABLE control4_projects (...);
```

### Enhanced Columns (All NULL - Backward Compatible)

```sql
-- Add optional columns to existing tables
ALTER TABLE proposal_line_items
  ADD COLUMN IF NOT EXISTS item_class text,
  ADD COLUMN IF NOT EXISTS labor_phase text,
  ADD COLUMN IF NOT EXISTS task_notes text,
  ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;

ALTER TABLE product_inventory
  ADD COLUMN IF NOT EXISTS bin_id uuid REFERENCES warehouse_bins(id);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS portal_last_sync timestamptz,
  ADD COLUMN IF NOT EXISTS control4_device_id text;
```

**Impact:** ZERO - all nullable, all backward compatible

---

## Navigation Structure - NO CHANGES NEEDED

### Current Navigation Stays Exactly The Same

**Sales Department:**
- ✅ Proposals (enhanced, not replaced)
- ✅ Sales Orders
- ✅ Performance

**Production Department:**
- ✅ Products & Inventory (enhanced with tabs)
- ✅ Projects
- ✅ Work Orders
- ✅ (all other existing modules)

**Admin Department:**
- ✅ Integrations (enhanced with Portal.io & Control4)
- ✅ (all other existing modules)

**No new modules added to navigation!**

---

## Permissions Strategy - Use Existing System

### NO New Permissions Needed!

All new features inherit existing module permissions:

1. **Proposal Grid Pro**
   - Uses `proposals` module permission
   - Anyone who can access proposals can use Pro Grid
   - Optional: Add `proposals_pro_view` permission for gradual rollout

2. **Warehouse Features**
   - Uses `products_catalog` module permission
   - Anyone who can access inventory can use warehouse features
   - Optional: Add specific permissions for receive/pick/transfer

3. **Portal.io & Control4**
   - Uses `integrations` module permission
   - Admin only (already enforced by module)

### Optional New Permissions (For Granular Control)

If you want more control, we can add:

```sql
-- Optional new permissions
INSERT INTO permissions (name, description, category) VALUES
  ('proposals_pro_grid', 'Use advanced proposal grid', 'proposals'),
  ('warehouse_receive', 'Receive inventory', 'inventory'),
  ('warehouse_pick', 'Pick items for jobs', 'inventory'),
  ('warehouse_transfer', 'Transfer between warehouses', 'inventory'),
  ('integrations_portal_io', 'Configure Portal.io', 'integrations'),
  ('integrations_control4', 'Configure Control4', 'integrations');
```

Then assign to roles:

```sql
-- Admin gets everything
-- Sales gets proposals_pro_grid
-- Warehouse staff gets receive/pick/transfer
```

**But this is optional!** Can start with existing permissions.

---

## User Experience - Before & After

### FOR SALES USERS (role='sales')

**BEFORE:**
- Proposals list view
- Basic proposal builder
- Manual product entry

**AFTER:**
- Same proposals list (default)
- Option to use "Pro Grid" view
- Portal.io product search with live pricing
- See stock availability when adding products
- No training required - can keep using classic view

**Access:** Uses existing `proposals` module permission

---

### FOR ADMIN USERS (role='admin')

**BEFORE:**
- Products management
- Basic inventory tracking
- QuickBooks integration

**AFTER:**
- Same products management (default)
- New: Warehouse tabs (Receive, Pick, Transfer, Stock)
- New: Barcode scanning
- New: Bin locations and serial tracking
- New: Portal.io integration settings
- New: Control4 integration settings

**Access:** Uses existing `products_catalog` and `integrations` module permissions

---

### FOR WAREHOUSE STAFF (if role created)

**Option A:** Grant access to `products_catalog` module
- Full access to all warehouse features
- Can receive, pick, transfer
- Can view stock levels

**Option B:** Create new granular permissions
- Grant only specific warehouse operations
- E.g., can receive but not transfer

---

## Rollout Strategy - Zero Risk

### Phase 1: Database (Week 1)
- ✅ Add new tables
- ✅ Add optional columns to existing tables
- ✅ All nullable, all backward compatible
- ✅ Existing app continues to work perfectly

### Phase 2: Proposal Grid (Week 2)
- ✅ Create ProposalBuilderPro component
- ✅ Add toggle to ProposalsView
- ✅ Default stays as classic view
- ✅ Power users opt-in to Pro Grid
- ✅ Both views available simultaneously

### Phase 3: Warehouse Module (Week 3)
- ✅ Add tabs to InventoryDashboard
- ✅ Create warehouse components
- ✅ Default tab stays as existing dashboard
- ✅ New tabs opt-in
- ✅ Barcode scanning added

### Phase 4: Integrations (Week 4)
- ✅ Add Portal.io to IntegrationsSettings
- ✅ Add Control4 to IntegrationsSettings
- ✅ Optional features - enable when ready
- ✅ Existing QuickBooks integration untouched

### Phase 5: Testing & Launch (Week 5-6)
- ✅ Full system testing
- ✅ User acceptance testing
- ✅ Training materials
- ✅ Production deployment

---

## Risk Assessment

### ✅ ZERO Risk to Existing Functionality

**Why:**
1. All new tables, no tables modified
2. All new columns are nullable
3. All new components are separate files
4. Existing components only enhanced with opt-in features
5. Default behavior unchanged
6. Navigation unchanged
7. Permissions system unchanged

### ✅ Easy Rollback Plan

**If needed:**
1. Remove toggle from ProposalsView → classic only
2. Remove tabs from InventoryDashboard → classic only
3. Remove integration settings → back to QuickBooks only
4. Database tables can stay (not used if UI removed)

### ✅ Gradual Adoption

- Sales team can test Pro Grid while others use classic
- Warehouse can test new features one tab at a time
- Integrations can be enabled when ready
- No "big bang" deployment needed

---

## Summary - What Gets Modified

### Modified Files (5)
1. ✅ `ProposalsView.tsx` - Add view toggle
2. ✅ `ProductSelector.tsx` - Enhance with Portal.io
3. ✅ `InventoryDashboard.tsx` - Add tabs
4. ✅ `IntegrationsSettings.tsx` - Add Portal.io & Control4
5. ✅ `App.tsx` - Import new components

### New Files (15+)
1. ✅ ProposalBuilderPro and related components (3 files)
2. ✅ Warehouse components (5 files)
3. ✅ Integration services (2 files)
4. ✅ Utility libraries (3 files)
5. ✅ Edge functions (6 files)

### Database (Additive Only)
1. ✅ 8 new tables
2. ✅ 7 new optional columns on existing tables
3. ✅ Zero breaking changes

### Navigation (ZERO Changes)
1. ✅ Same departments
2. ✅ Same modules
3. ✅ Same menu structure
4. ✅ Optional: Add new permissions for granular control

---

## Recommendation

**Proceed with this plan?**

This approach:
- ✅ Uses your existing navigation and permissions
- ✅ Enhances existing pages, doesn't replace them
- ✅ Zero breaking changes
- ✅ Easy to rollback if needed
- ✅ Gradual adoption possible
- ✅ 5-6 week timeline
- ✅ All benefits, zero risk

**Next step:** Get your approval, then start with database enhancements (Week 1)

Ready to begin? 🚀
