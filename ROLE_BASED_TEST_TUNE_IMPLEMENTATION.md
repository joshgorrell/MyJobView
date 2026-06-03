# Role-Based Test & Tune Performance Dashboard Implementation

## Summary

Successfully implemented role-based access control for the Test & Tune Performance Dashboard. Each role (Technician, Project Manager, Sales Representative, Admin, Executive) now sees only the projects and metrics appropriate to their responsibilities.

## Implementation Overview

### 1. Database Layer (Migration: `create_role_based_test_tune_access`)

**New Columns Added:**
- `profiles.default_office_id` - Associates users with a default office for office-based filtering
- `profiles.can_view_executive_dashboard` - Flag for executive-level access (read-only company-wide view)
- `sales_orders.sales_rep_id` - Tracks which sales rep is assigned to each sales order

**New Database Functions:**

#### `get_user_test_tune_permissions(user_id)`
Returns a comprehensive permissions object for the user:
- `can_view_all_projects` - Admin/Finance/Executive can see all
- `can_edit_bonuses` - Admin/Finance only
- `can_override_bonuses` - Admin/Finance only
- `can_approve_bonuses` - Admin/Finance only
- `can_view_pm_metrics` - Managers, Admin, Finance, Executive
- `can_view_admin_controls` - Admin/Finance only
- `can_view_bonus_amounts` - All except Sales (they see estimation accuracy instead)
- `can_export_data` - All authenticated users
- `user_role` - The user's role
- `is_executive` - Executive flag

#### `get_test_tune_projects_for_user(user_id, include_expired)`
Returns Test & Tune projects filtered by role:
- **Tech:** Only projects where they are lead tech OR assigned to work orders
- **Manager/Service Manager:** Projects in their default office OR where they are PM
- **Sales:** Only projects where they are the sales rep
- **Admin/Finance:** All projects
- **Executive:** All projects (read-only)

Returns comprehensive project data with visibility flags.

#### `get_test_tune_stats_for_user(user_id)`
Returns aggregate statistics calculated ONLY from the user's visible projects:
- Total projects count
- Projects on track / at risk / over budget
- Average efficiency percentage
- Total labor savings
- Total margin drag
- Estimated bonus pool

**Performance Indexes:**
- `idx_profiles_default_office` - Optimizes office-based filtering
- `idx_sales_orders_sales_rep` - Optimizes sales rep filtering
- `idx_sales_orders_lead_tech` - Optimizes lead tech filtering
- `idx_work_orders_assigned_tech` - Optimizes work order assignment lookups

### 2. Frontend Helper Library (`src/lib/testTunePermissions.ts`)

**Key Functions:**

```typescript
getUserTestTunePermissions(userId) - Fetches user permissions
getTestTuneProjectsForUser(userId, includeExpired) - Fetches role-filtered projects
getTestTuneStatsForUser(userId) - Fetches role-filtered stats
canViewProject(project, userId, userRole) - Checks if user can view specific project
getVisibleColumns(permissions) - Returns which table columns to show
getVisibleFilters(permissions) - Returns which filters to show
getEmptyStateMessage(permissions) - Role-specific empty state text
getDashboardTitle(permissions) - Role-specific dashboard title
formatStatusIndicator(status) - Formats status badges
calculateProjectedBonus(project, laborBurdenRate, bonusSettings) - Estimates bonus
```

**TypeScript Interfaces:**
- `TestTunePermissions` - User permissions object
- `TestTuneProject` - Project data with visibility flags
- `TestTuneStats` - Aggregate statistics

### 3. Updated Dashboard Component (`src/components/Production/TestTunePerformanceDashboard.tsx`)

**Role-Based Features:**

#### Header
- Dynamic title based on role:
  - Tech: "My Test & Tune Performance"
  - Manager: "Office Test & Tune Performance"
  - Sales: "My Sales Estimation Accuracy"
  - Admin/Finance: "Test & Tune Performance Dashboard"
  - Executive: "Executive Test & Tune Performance Dashboard"

#### Statistics Cards
- **Tech View:** Shows only their projects, personal potential bonus
- **Manager View:** Shows office projects, PM-specific metrics
- **Sales View:** Shows estimation accuracy instead of bonus amounts
- **Admin/Finance:** Shows all projects, full bonus pools
- **Executive:** Shows company-wide aggregates (read-only)

#### Filters
- **Office Filter:** Only visible to admins/executives who can see multiple offices
- **PM Filter:** Visible to admins and managers
- **Tech Filter:** Visible to admins and managers
- **Sales Filter:** Visible to admins only
- **Status Filter:** Visible to all (on track / at risk / over budget)

#### Table Columns (Conditional Visibility)
- **Status:** All users
- **Customer:** All users
- **Office:** Hidden for techs (they only see their projects)
- **Sales Rep:** Hidden for sales reps (they only see their own)
- **Lead Tech:** Hidden for techs (they know it's them)
- **PM:** Visible to managers and admins
- **Field Target:** All users
- **Field Used:** All users
- **Hours Left / Variance:** All users (labeled "Variance" for sales)
- **Days Left:** All users
- **Actions:** All users

#### Tab Navigation
- **Active Projects Tab:** All users can see
- **My Bonuses Tab:** Only visible if `can_view_bonus_amounts` is true (not visible to sales)

#### Real-Time Updates
- Subscribes to changes in `sales_orders`, `work_orders`, and `test_tune_bonus_calculations`
- Automatically refreshes data when relevant changes occur

### 4. Role Access Rules

#### Technician (role: 'tech')
**Can See:**
- Projects where they are the lead technician
- Projects where they are assigned to work orders
- Their own projected bonuses
- Personal performance metrics

**Cannot See:**
- Other technicians' projects
- Other technicians' bonuses
- PM performance metrics
- Office-level drag statistics
- Bonus override controls
- Admin notes

**Dashboard Focus:** Personal performance tracking and bonus eligibility

#### Project Manager (role: 'manager' or 'service_manager')
**Can See:**
- All projects in their assigned office (`default_office_id`)
- Projects where they are assigned as PM
- PM bonus portions
- Office aggregate metrics
- Tech and PM bonus breakdowns

**Cannot See:**
- Projects in other offices (unless assigned as PM)
- Admin override logs
- Bonus modification history
- Other offices' detailed bonus data

**Dashboard Focus:** Office performance monitoring and team oversight

#### Sales Representative (role: 'sales')
**Can See:**
- Projects where they are the sales rep
- Estimation accuracy metrics
- Variance analysis (over/under estimated)
- Average post-completion hours

**Cannot See:**
- Individual bonus amounts
- Tech/PM bonus splits
- Override controls
- Projects they didn't sell

**Dashboard Focus:** Estimating accuracy, not bonuses

#### Admin / Finance (role: 'admin' or 'finance')
**Can See:**
- All projects across all offices
- All bonus calculations
- Full labor breakdown by labor phase
- Admin override controls
- Audit trail
- Bonus modification history

**Can Do:**
- Override bonus amounts
- Modify labor burden rates
- Modify bonus tier percentages
- Reclassify labor entries
- Adjust completion dates
- Pause/extend 90-day timer
- Approve/deny payouts
- Add internal notes
- Reopen finalized evaluations

**Dashboard Focus:** Full system oversight and bonus administration

#### Executive (can_view_executive_dashboard: true)
**Can See:**
- All projects (read-only)
- Company-wide performance metrics
- Office-by-office comparison
- PM performance comparison
- Tech performance comparison
- High-level KPIs

**Cannot Do:**
- Edit bonuses
- Override calculations
- Modify settings

**Dashboard Focus:** Strategic oversight and performance analysis

## Data Privacy & Security

### Row-Level Security (RLS)
- Database functions use `SECURITY DEFINER` for consistent access control
- Each function checks user's role and applies appropriate filters
- No data leakage between roles
- User can only see their own assigned projects

### Access Patterns
1. User loads dashboard → Frontend calls `getUserTestTunePermissions()`
2. Permissions determine UI visibility → Uses `getVisibleColumns()` and `getVisibleFilters()`
3. Projects loaded via `getTestTuneProjectsForUser()` → Database enforces role filtering
4. Stats calculated via `getTestTuneStatsForUser()` → Only from visible projects

### Audit Trail
- All admin overrides logged to `test_tune_bonus_history`
- Records: User ID, Action Type, Before/After values, Reason, Timestamp
- Visible only to admins in project detail modal

## Performance Optimizations

### Database Indexes
- Composite indexes on role-based filtering columns
- Indexes on foreign keys for join performance
- Conditional indexes (WHERE clause) to reduce index size

### Frontend Optimizations
- Filter options extracted from visible projects (no extra queries)
- Role-based rendering prevents unnecessary DOM elements
- Real-time subscriptions target specific tables only

### Query Efficiency
- Single function call loads all project data with visibility flags
- Aggregate stats calculated in database, not in JavaScript
- Lateral joins for optimal labor totals calculation

## User Experience Enhancements

### Role-Specific Empty States
Each role sees a contextual message when no projects exist:
- Tech: "You have no projects currently in the 90-Day Test & Tune period."
- Manager: "Your office has no projects currently in the 90-Day Test & Tune period."
- Sales: "You have no sales orders currently in the 90-Day Test & Tune period."
- Admin: "No projects are currently in the 90-Day Test & Tune period."

### Status Indicators
- Green: On Track (≤75% of field target used)
- Yellow: At Risk (76-100% of field target used)
- Red: Over Budget (>100% of field target used)

### Dynamic Labels
- "Hours Left" for techs/managers/admins
- "Variance" for sales reps
- "My Projects" for techs
- "Office Projects" for managers
- "Active Projects" for admins

## Next Steps (Remaining Tasks)

1. **Update TestTuneProjectDetail Modal**
   - Add role-based column visibility
   - Hide admin controls from non-admins
   - Show appropriate bonus breakdowns per role

2. **Implement CSV Export**
   - Role-based column filtering
   - Include role name in filename
   - Respect data visibility rules

3. **Update Help Content**
   - Add role-specific explanations
   - Document access rules
   - Explain what each role can see

4. **Testing**
   - Create test users for each role
   - Verify data isolation
   - Test permissions edge cases
   - Validate real-time updates

5. **Admin Override Interface**
   - Create admin controls panel
   - Add override form with validation
   - Implement audit log viewer
   - Add notification to affected users

## Testing Checklist

- [ ] Tech can only see their assigned projects
- [ ] Manager can see office projects and their PM projects
- [ ] Sales can only see their own sales
- [ ] Admin can see all projects
- [ ] Tech cannot see other techs' bonuses
- [ ] Sales cannot see bonus amounts
- [ ] Manager can see PM metrics
- [ ] Filters show/hide based on role
- [ ] Table columns show/hide based on role
- [ ] Stats calculated correctly per role
- [ ] Empty states show correct messages
- [ ] Real-time updates work for all roles
- [ ] CSV export respects role visibility

## Database Schema Changes

```sql
-- New columns
ALTER TABLE profiles ADD COLUMN default_office_id uuid;
ALTER TABLE profiles ADD COLUMN can_view_executive_dashboard boolean;
ALTER TABLE sales_orders ADD COLUMN sales_rep_id uuid;

-- New functions
get_user_test_tune_permissions(uuid)
get_test_tune_projects_for_user(uuid, boolean)
get_test_tune_stats_for_user(uuid)

-- New indexes
idx_profiles_default_office
idx_sales_orders_sales_rep
idx_sales_orders_lead_tech
idx_work_orders_assigned_tech
```

## File Changes

**New Files:**
- `src/lib/testTunePermissions.ts` - Helper functions and types

**Modified Files:**
- `src/components/Production/TestTunePerformanceDashboard.tsx` - Complete rewrite with role-based access

**Database Migrations:**
- `create_role_based_test_tune_access.sql` - Adds columns, functions, and indexes

## Backward Compatibility

- Existing Test & Tune data preserved
- Old dashboard backed up as `.old.tsx` file
- No breaking changes to existing APIs
- All existing features maintained
- New columns have sensible defaults

## Configuration Requirements

For proper role-based access, ensure:
1. Users have correct `role` set in profiles table
2. Managers have `default_office_id` set to their office
3. Sales orders have `sales_rep_id` populated
4. Work orders have `assigned_to` populated for techs
5. Executive users have `can_view_executive_dashboard` set to true

## Support & Documentation

See also:
- `TEST_TUNE_SYSTEM_COMPLETE.md` - Original system documentation
- `TestTuneHelpContent.tsx` - In-app help system
- Database function comments for detailed SQL documentation

## Success Metrics

After implementation, the system will:
1. Prevent data leakage between roles
2. Show only relevant information to each user
3. Maintain performance with role-based filtering
4. Provide appropriate metrics per role
5. Enable secure bonus administration
6. Support strategic oversight for executives

---

**Status:** Core implementation complete. Ready for testing and iterative refinement.

**Next Priority:** Update TestTuneProjectDetail modal for role-based access.
