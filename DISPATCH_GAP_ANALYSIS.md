# DISPATCH MODULE - GAP ANALYSIS

## Executive Summary

**Overall Status:** ~65% Complete
**Database Schema:** ~85% Complete
**UI Components:** ~60% Complete
**Integration/Workflow:** ~40% Complete

---

## ✅ WHAT YOU HAVE NOW

### **Database Tables (Complete)**

#### Core Dispatch Tables:
1. ✅ `service_requests` (27 columns)
   - Customer info, location, description, priority
   - Billable type/by tracking
   - Requested tech/date/time
   - Status workflow
   - Attachments and notes
   - Offline support

2. ✅ `work_orders` (30 columns)
   - Project-based and service-based WOs
   - Status tracking (pending → completed)
   - Priority levels
   - Assignment to techs
   - Start/target/completion dates
   - Location (address + lat/lng)
   - Office assignment
   - Hours tracking (estimated vs actual)

3. ✅ `work_order_tasks` (11 columns)
   - Task breakdown within WOs
   - Checklist functionality

4. ✅ `work_order_materials` (11 columns)
   - Material tracking per WO

5. ✅ `appointments` (22 columns)
   - Scheduling system
   - Tech assignment
   - Customer confirmation
   - Recurring appointments support

6. ✅ `technician_locations` (11 columns)
   - Real-time GPS tracking
   - Last known position
   - Accuracy tracking

7. ✅ `gps_breadcrumbs` (12 columns)
   - Historical GPS trail
   - Speed, accuracy tracking
   - Work order association

8. ✅ `technician_status` (8 columns)
   - Current status (available, on_job, traveling, break, off_duty)
   - Current work order
   - Last update timestamp

9. ✅ `crew_assignments` (9 columns)
   - Multi-tech job assignments
   - Role assignment (lead, helper)

10. ✅ `travel_bonus_requests` (22 columns)
    - Origin/destination tracking
    - Miles outside bubble
    - Bonus calculation
    - Approval workflow
    - Payment tracking

11. ✅ `daily_clock_entries` (from migration)
    - Daily clock in/out
    - Break tracking
    - Hours calculation
    - Status workflow

12. ✅ `projects` (existing)
    - Project management
    - Contact association

13. ✅ `contacts` (existing)
    - Customer data

---

### **UI Components (Existing)**

#### 1. ✅ DispatchDashboard.tsx
**What it does:**
- Shows high-level stats:
  - Available techs
  - Active jobs
  - Unassigned jobs count
  - Travel bonus queue count
  - Today's completions
  - Utilization rate
- Real-time subscriptions
- KPI cards

**Status:** Basic dashboard exists, displays stats

---

#### 2. ✅ TechMap.tsx
**What it does:**
- Real-time tech location display
- GPS breadcrumb trails
- Tech status indicators
- Click tech to see details
- Filters by status

**Status:** Core map functionality exists

---

#### 3. ✅ ScheduleBoard.tsx
**What it does:**
- Calendar view (day/week/month)
- Work order display by tech
- Drag-and-drop scheduling
- Quick actions (view, edit, reassign)
- Filter by tech, priority, status

**Status:** Calendar scheduling exists

---

#### 4. ✅ TechStatusDashboard.tsx
**What it does:**
- List of all technicians
- Current status per tech
- Jobs assigned today
- Clock in/out status
- Quick actions

**Status:** Tech status overview exists

---

#### 5. ✅ UnassignedJobs.tsx
**What it does:**
- Shows unassigned work orders
- Priority filtering
- Tech assignment interface
- Job details panel
- Quick assign functionality

**Status:** Unassigned queue exists (for Work Orders)

---

#### 6. ✅ CrewAssignment.tsx
**What it does:**
- Multi-tech assignment
- Role selection (lead/helper)
- Crew management

**Status:** Crew functionality exists

---

#### 7. ✅ TravelBonusQueue.tsx
**What it does:**
- List of pending travel bonus requests
- Map preview
- Approve/deny/adjust buttons
- Bonus calculation display

**Status:** Full approval workflow exists

---

#### 8. ✅ TravelBonusTracking.tsx
**What it does:**
- Historical travel bonus data
- Payment tracking
- Analytics

**Status:** History and tracking exists

---

#### 9. ✅ DispatchView.tsx
**What it does:**
- Container component for all dispatch sub-views
- Tab navigation

**Status:** Main container exists

---

#### 10. ✅ ServiceRequestForm.tsx
**What it does:**
- Create new service requests
- Customer search/selection
- Job details entry
- Priority selection
- Billable type selection
- Requested tech/date/time

**Status:** Full form exists

---

## ❌ WHAT'S MISSING

### **Critical Missing Components**

#### 1. ❌ **Service Request Queue Component**
**What spec requires:**
- Dedicated view showing ALL unscheduled service requests
- Not work orders - SERVICE REQUESTS specifically
- Display: customer, address, description, priority, requested tech/date
- Actions: Assign Tech, Add to Schedule, Merge, Convert to Project, Cancel

**What you have:**
- ServiceRequestForm creates requests
- No dedicated queue view component
- UnassignedJobs only shows work_orders, not service_requests

**Gap:** Need `ServiceRequestQueue.tsx` component

---

#### 2. ❌ **Project Work Orders Queue**
**What spec requires:**
- Separate queue for project-based work orders
- Show WOs auto-generated from projects
- Display: project name, PM, tasks, timeline
- Indicate "non-billable" clearly
- Allow dispatch to schedule without affecting billing

**What you have:**
- work_orders table has project_id field
- UnassignedJobs shows all WOs together
- No separation of project vs service WOs

**Gap:** Need `ProjectWorkOrdersQueue.tsx` component

---

#### 3. ❌ **On-the-Fly / Emergency Job Creator**
**What spec requires:**
- Quick "Create Emergency Job" button
- Minimal fields: Customer, Description, Assign Tech, GO NOW
- "Force Assign" override if tech is busy
- Immediate push notification
- Job appears at top of tech's list

**What you have:**
- ServiceRequestForm (too many fields)
- No rapid-response workflow
- No "force assign" logic

**Gap:** Need `EmergencyJobModal.tsx` component

---

#### 4. ❌ **Service Request → Work Order Conversion Workflow**
**What spec requires:**
- Service requests must convert to work orders when assigned
- Clear status transition: "New Request" → "Scheduled" (creates WO)
- Link between service_request and work_order
- Notification to tech when WO created

**What you have:**
- service_requests.work_order_id field exists
- No UI to convert service_request → work_order
- No automated workflow

**Gap:** Need conversion logic + UI

---

#### 5. ❌ **Job Status Tracking Panel**
**What spec requires:**
- Live view of job progression:
  - "En Route"
  - "On Site"
  - "Clocked In"
  - "Clocked Out"
  - "Needs Info"
- Real-time updates from tech actions
- Estimated completion times
- Travel time between jobs

**What you have:**
- work_orders.status field (basic)
- technician_status table (current status)
- No granular "en route" vs "on site" tracking

**Gap:** Need enhanced status workflow + UI component

---

#### 6. ❌ **Tech Assignment + Notification System**
**What spec requires:**
- When dispatch assigns a tech:
  - Push notification sent immediately
  - Tech sees job on dashboard/calendar
  - Optional: Tech must "Accept" job
- When dispatch updates job:
  - Push notification for changes
  - In-app alert

**What you have:**
- Assignment UI exists in UnassignedJobs
- No push notification integration
- No "accept job" workflow

**Gap:** Need notification service integration

---

#### 7. ❌ **Drag & Drop Multi-Day/Multi-Tech Split**
**What spec requires:**
- Split job into:
  - Multiple days
  - Multiple techs
  - AM/PM sections
- Drag portions between techs
- Maintain job linkage

**What you have:**
- ScheduleBoard has drag-and-drop
- No job splitting functionality
- No multi-day scheduling

**Gap:** Need advanced scheduling features

---

#### 8. ❌ **Merge Jobs Functionality**
**What spec requires:**
- Combine multiple service requests from same customer
- Example: "3 small issues → 1 job"
- Maintain individual request history

**What you have:**
- No merge capability

**Gap:** Need merge workflow + UI

---

#### 9. ❌ **Customer Communication Panel**
**What spec requires:**
- Dispatch can send:
  - "Tech on the way"
  - "Arrival time updated"
  - "Job rescheduled"
- Messages appear in Customer Portal
- SMS/Email options

**What you have:**
- messaging table exists
- No dispatch-initiated messaging UI

**Gap:** Need customer communication UI

---

#### 10. ❌ **Skills-Based Tech Filtering**
**What spec requires:**
- Filter techs by skill:
  - Audio
  - Cameras
  - Networking
  - Programming
  - Prewire
  - Senior tech only
- Smart assignment suggestions

**What you have:**
- No skills tracking in profiles table
- No filtering by skills

**Gap:** Need skills schema + filtering

---

#### 11. ❌ **Weekly/Monthly Tech Schedule View**
**What spec requires:**
- See entire week/month for one tech
- Color-coded by job type
- Capacity planning

**What you have:**
- ScheduleBoard shows calendar
- Limited to daily/weekly all-techs view

**Gap:** Need individual tech timeline view

---

#### 12. ❌ **Real-Time ETA Calculations**
**What spec requires:**
- Show estimated arrival time
- Calculate travel time between jobs
- Update based on GPS location

**What you have:**
- GPS tracking exists
- No ETA calculation logic

**Gap:** Need distance/time calculation service

---

### **Database Schema Gaps**

#### 1. ❌ **Job Status Granularity**
**Current:** work_orders.status has basic states
**Need:**
- `en_route` status
- `on_site` status
- `needs_info` flag
- `blocked_reason` field

---

#### 2. ❌ **Tech Skills Table**
**Missing:**
```sql
CREATE TABLE technician_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES profiles(id),
  skill_type text NOT NULL,
  proficiency_level text, -- beginner, intermediate, expert
  certified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

---

#### 3. ❌ **Job Accept/Decline Log**
**Missing:**
```sql
CREATE TABLE job_acceptance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES work_orders(id),
  technician_id uuid REFERENCES profiles(id),
  action text NOT NULL, -- accepted, declined, reassigned
  reason text,
  created_at timestamptz DEFAULT now()
);
```

---

#### 4. ❌ **Service Request → Work Order Link Tracking**
**Current:** service_requests.work_order_id exists
**Missing:** Conversion timestamp, converted_by tracking

---

#### 5. ❌ **Job Split/Merge History**
**Missing:** Table to track when jobs are split or merged

---

### **Integration Gaps**

#### 1. ❌ **Push Notifications**
- Edge function exists: `send-push-notification`
- Not integrated into dispatch workflows
- Need: Dispatch assignment → trigger notification

---

#### 2. ❌ **SMS Notifications**
- Edge function exists: `send-sms-reminder`
- Not integrated into dispatch customer communication
- Need: "Tech on the way" SMS

---

#### 3. ❌ **Offline Sync for Dispatch**
- Offline support exists for other modules
- Not tested/integrated for dispatch operations
- Need: Cached assignment changes

---

#### 4. ❌ **Tech Module Integration**
- Tech-side components exist (TechDashboard, DailyClock, GPSTracker)
- Not fully integrated with dispatch actions
- Need: Real-time status updates from tech → dispatch

---

#### 5. ❌ **Service Billing Integration**
- Service Billing Queue exists
- No clear handoff from dispatch → billing
- Need: "Job Complete" → auto-add to billing queue

---

## 📊 FEATURE COMPLETION MATRIX

| Feature | Database | UI | Integration | Status |
|---------|----------|----|-----------| -------|
| Real-time tech map | ✅ | ✅ | ⚠️ | 80% |
| GPS breadcrumbs | ✅ | ✅ | ✅ | 100% |
| Tech status tracking | ✅ | ✅ | ⚠️ | 75% |
| Schedule board | ✅ | ✅ | ⚠️ | 70% |
| Work order assignment | ✅ | ✅ | ❌ | 60% |
| Service request queue | ✅ | ❌ | ❌ | 30% |
| Project WO queue | ✅ | ❌ | ❌ | 25% |
| Emergency jobs | ⚠️ | ❌ | ❌ | 20% |
| Travel bonus approval | ✅ | ✅ | ✅ | 100% |
| Crew assignment | ✅ | ✅ | ⚠️ | 75% |
| Job splitting | ❌ | ❌ | ❌ | 0% |
| Job merging | ❌ | ❌ | ❌ | 0% |
| Customer communication | ⚠️ | ❌ | ❌ | 20% |
| Tech notifications | ✅ | ❌ | ❌ | 30% |
| Skills-based filtering | ❌ | ❌ | ❌ | 0% |
| ETA calculations | ❌ | ❌ | ❌ | 0% |
| Job acceptance workflow | ❌ | ❌ | ❌ | 0% |
| Multi-day scheduling | ⚠️ | ❌ | ❌ | 15% |
| Status transitions tracking | ⚠️ | ⚠️ | ❌ | 40% |

---

## 🎯 PRIORITY RECOMMENDATIONS

### **Phase 1: Critical Gaps (Complete Minimum Viable Dispatch)**

1. **Create ServiceRequestQueue Component**
   - Show all unscheduled service requests
   - Actions: Assign, Schedule, Convert to WO
   - Priority: HIGH

2. **Service Request → Work Order Conversion**
   - Add "Convert to Work Order" button
   - Auto-fill WO from service request data
   - Update service_requests.work_order_id
   - Priority: HIGH

3. **Tech Assignment Notifications**
   - Integrate push notification on assignment
   - Show "New Job" alert on tech dashboard
   - Priority: HIGH

4. **Project Work Orders Queue**
   - Filter work_orders WHERE project_id IS NOT NULL
   - Show project context
   - Priority: MEDIUM

5. **Emergency Job Modal**
   - Quick create form
   - Minimal fields
   - "GO NOW" priority
   - Priority: MEDIUM

---

### **Phase 2: Enhanced Workflow**

6. **Job Status Enhancements**
   - Add en_route, on_site, needs_info statuses
   - Real-time status panel
   - Priority: MEDIUM

7. **Customer Communication**
   - Dispatch messaging UI
   - "Tech on the way" button
   - SMS/Email toggle
   - Priority: MEDIUM

8. **Tech Skills System**
   - Add skills to profiles
   - Filter techs by skills
   - Smart recommendations
   - Priority: LOW

---

### **Phase 3: Advanced Features**

9. **Job Split/Merge**
   - Multi-day scheduling
   - Split between techs
   - Merge service requests
   - Priority: LOW

10. **ETA Calculations**
    - Distance calculation
    - Traffic estimation
    - Arrival time display
    - Priority: LOW

11. **Job Acceptance Workflow**
    - Tech accepts/declines
    - Tracking log
    - Auto-reassign on decline
    - Priority: LOW

---

## 📋 ACCEPTANCE CRITERIA STATUS

| Requirement | Status | Notes |
|-------------|--------|-------|
| Real-time tech map functions | ✅ | Complete |
| Breadcrumbs appear accurately | ✅ | Complete |
| Service requests flow into queue | ⚠️ | Data flows, UI missing |
| Dispatch can schedule/assign jobs | ⚠️ | Works for WOs, not service requests |
| Techs receive job updates | ❌ | No notifications |
| Tech status updates live | ✅ | Real-time working |
| Calendar drag-and-drop works | ✅ | Working |
| Billing integration works | ⚠️ | Partial |
| Project WOs flow to scheduling | ⚠️ | Data exists, UI missing |
| Travel bonus approval works | ✅ | Complete |
| Offline sync works | ⚠️ | Needs testing |
| Notes/attachments flow cleanly | ✅ | Working |
| Cross-module communication seamless | ❌ | Gaps exist |

---

## 🚀 NEXT STEPS

### **Immediate Actions:**

1. Build `ServiceRequestQueue.tsx`
2. Build `ProjectWorkOrdersQueue.tsx`
3. Add "Convert to Work Order" workflow
4. Integrate push notifications
5. Build `EmergencyJobModal.tsx`
6. Test complete dispatch → tech → billing flow

### **Database Migrations Needed:**

1. Add `technician_skills` table
2. Add `job_acceptance_log` table
3. Enhance `work_orders.status` enum
4. Add conversion tracking to `service_requests`

### **Integration Work Needed:**

1. Push notifications on job assignment
2. SMS for customer updates
3. Tech dashboard real-time updates
4. Service billing handoff

---

**Bottom Line:** You have a strong foundation (~65% complete) with excellent database design and core UI components. The main gaps are in workflow automation, notifications, and specialized queue views for service requests vs project work orders.
