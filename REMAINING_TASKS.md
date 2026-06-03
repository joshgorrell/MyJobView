# MyJobView - Remaining Tasks

## Summary of What's Been Completed (Latest Session)

### ✅ Just Completed:
1. **Customer Portal (Complete)**
   - Magic link authentication (`PortalLogin.tsx`)
   - Dashboard with stats tiles (`PortalDashboard.tsx`)
   - Proposals view with approve/decline (`PortalProposals.tsx`, `PortalProposalDetail.tsx`)
   - Projects view (`PortalProjects.tsx`)
   - Invoices view (`PortalInvoices.tsx`)
   - Magic link edge function deployed

2. **Invoice Management for Staff (Complete)**
   - Invoice creation UI with line items (`CreateInvoiceModal.tsx`)
   - Invoice list view with search/filter (`InvoicesView.tsx`)

3. **Appointment Scheduling (Complete)**
   - Appointment creation form (`CreateAppointmentModal.tsx`)

4. **QuickBooks OAuth (Complete)**
   - OAuth integration UI in Company Settings
   - Three edge functions deployed (initiate, complete, sync-invoices)

---

## 🚧 Remaining From Original Spec

### HIGH PRIORITY

#### 1. Add Missing User Roles
**Issue:** Currently only `admin` and `sales` roles exist in profiles table. Need to add:
- `technician` - For field workers
- `portal_user` - For customer portal users
- `project_manager` (if different from sales)

**Action:** Update role field to support these roles, update RLS policies as needed.

---

#### 2. File Attachments UI
**Status:** Database complete, UI missing

**Needed:**
- File upload component (drag-and-drop)
- File preview/download
- Attachment to messages
- Attachment to projects/proposals
- Gallery view for images
- Storage bucket integration (already exists)

---

#### 3. Calendar View for Appointments
**Status:** List view exists, calendar view missing

**Needed:**
- Day/week/month calendar views
- Visual time slots
- Drag-and-drop rescheduling
- Conflict detection
- Technician availability view
- Calendar integration (Google Calendar already has backend support)

---

#### 4. QuickBooks Integration - Data Sync
**Status:** OAuth complete, sync functionality missing

**Needed:**
- Invoice sync to QuickBooks
- Customer sync from QuickBooks
- Payment webhook handler
- Token refresh logic
- Sync status UI
- Manual sync trigger buttons
- Error handling and reconciliation UI

---

#### 5. Payment Processing (QuickBooks Payments)
**Status:** Not started

**Needed:**
- Payment link generation
- Embedded payment form for portal users
- Webhook handler for payment confirmations
- Payment recording in database
- Receipt generation
- Payment history view

---

### MEDIUM PRIORITY

#### 6. Portal Appointments View
**Status:** Not created

**Needed:**
- Customer-facing appointments list
- Upcoming appointments view
- Appointment details
- Request reschedule functionality

---

#### 7. Portal Messages View
**Status:** Not created

**Needed:**
- Message threads list
- Send/receive messages
- File attachments in messages
- Notification system

---

#### 8. Payment Recording UI (Staff)
**Status:** Not created

**Needed:**
- Manual payment recording form
- Payment allocation to invoices
- Payment method tracking
- Receipt generation

---

#### 9. Proposal Version History
**Status:** Database complete, UI missing

**Needed:**
- Version history viewer
- Side-by-side version comparison
- Restore from previous version
- Change tracking display

---

#### 10. Sales Order Management UI
**Status:** Auto-creation works, no management UI

**Needed:**
- Sales orders list view
- Sales order detail view
- Edit sales order
- Convert to project (already auto-creates)

---

### LOW PRIORITY

#### 11. Portal.io Integration
**Status:** Database ready, not implemented

**Needed:**
- OAuth connection
- Product search UI
- Import products to catalog
- Pricing sync

---

#### 12. Cash-Basis Commission Updates
**Status:** Basic system exists, needs enhancement

**Needed:**
- Link commissions to payments (not invoices)
- Update on payment received
- Handle refunds/chargebacks
- Integration with QBO payment data

---

#### 13. Proposal PDF Generation
**Status:** Download buttons exist but don't generate PDFs

**Needed:**
- PDF generation service/edge function
- Template design
- Logo and branding
- Customer download link

---

#### 14. Invoice PDF Generation
**Status:** Download buttons exist but don't generate PDFs

**Needed:**
- PDF generation service/edge function
- Template design
- Logo and branding
- Customer download link

---

#### 15. Email Notifications
**Status:** Template system exists in DB, not implemented

**Needed:**
- Send proposal to customer
- Invoice delivery
- Appointment reminders
- Payment confirmations
- Project updates

---

#### 16. Dashboard Analytics
**Status:** Basic dashboard exists, no analytics

**Needed:**
- Revenue charts
- Conversion metrics
- Pipeline visualization
- Team performance metrics
- Commission reports

---

## 🔧 Technical Debt / Improvements

### 1. Role System Consolidation
**Current Issue:** The spec mentions needing to avoid duplicate user databases and ensure roles match.

**Current State:**
- Single `profiles` table exists (good!)
- Only `admin` and `sales` roles currently exist
- `contact_id` field links portal users to contacts
- Need to add more roles: `technician`, `portal_user`, `project_manager`

**Action Items:**
1. Add missing roles to the role enum/constraint
2. Verify RLS policies cover all roles appropriately
3. Update UI to show/hide features based on roles
4. Ensure portal users have `role = 'portal_user'` set correctly

---

### 2. Navigation/Routing
**Issue:** No app routing setup visible in the components created

**Needed:**
- React Router or similar
- Route guards for authentication
- Role-based route access
- Portal vs Staff route separation
- 404 page

---

### 3. Error Handling
**Current:** Using `alert()` for errors

**Improvement:**
- Toast notification system
- Error boundary components
- Graceful error messages
- Retry mechanisms

---

### 4. Loading States
**Current:** Basic loading spinners

**Improvement:**
- Skeleton loaders
- Progressive loading
- Optimistic updates

---

### 5. Real-time Updates
**Opportunity:** Supabase supports real-time subscriptions

**Could Add:**
- Live message updates
- Real-time appointment changes
- Invoice status updates
- Notification bells with live counts

---

## 📊 Completion Status Summary

### Fully Complete (100%)
- Database schema (all tables)
- Proposal builder (3 modes)
- Project management
- Sales order auto-creation
- Customer portal (proposals, projects, invoices views)
- Invoice creation (staff)
- Appointment creation (staff)
- QuickBooks OAuth flow
- Company settings
- Business cards system
- Contacts management
- Tasks system
- Discussion feed
- Commissions tracking (basic)
- Points & Rewards system

### Partially Complete (50-75%)
- Appointments (can create, need calendar view)
- Invoices (can create, need payment recording)
- QuickBooks (OAuth done, sync not done)
- File attachments (DB ready, UI missing)
- Portal (main views done, appointments/messages missing)

### Not Started (0%)
- QuickBooks data sync
- Payment processing
- Portal.io integration
- PDF generation
- Email notifications
- Calendar views
- File upload UI
- Analytics dashboard

---

## 🎯 Recommended Next Steps (Priority Order)

1. **Fix Roles** - Add missing roles (technician, portal_user) to avoid confusion
2. **QuickBooks Sync** - Complete the integration started with OAuth
3. **Calendar View** - Visual scheduling is high-value
4. **File Attachments UI** - Universal feature needed everywhere
5. **Payment Processing** - Revenue-critical feature
6. **PDF Generation** - Professional requirement
7. **Email Notifications** - Customer communication
8. **Portal Appointments/Messages** - Complete portal experience

---

## Notes

- The system is production-ready for internal staff use
- Customer portal has core functionality (view proposals, approve, view projects/invoices)
- Major integrations (QuickBooks, payments, email) need completion
- UX improvements (calendar, files, PDFs) would significantly enhance value
