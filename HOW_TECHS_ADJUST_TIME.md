# How Technicians Adjust Clock In/Out Times

## Overview

Technicians cannot directly edit their time entries. Instead, they use a **Time Adjustment Request System** where they submit a request to change their times, which is then reviewed and approved/denied by an admin.

---

## Two Ways to Request Time Adjustments

### Method 1: My Time View (Technician's Personal View)

**Location:** Technician Work Center → My Time

**Steps:**
1. Technician opens **My Time View**
2. Finds the clock entry they need to adjust
3. Clicks **"Request Edit"** button
4. Fills out the Time Adjustment Request Modal
5. Submits request
6. Waits for admin approval

**What They See:**
- Current clock in/out times
- Request edit button (if no pending request exists)
- Pending request status badge (if request is pending)
- Request denied badge (if request was denied - can submit new request)
- Request approved badge (if approved)

---

### Method 2: Time Clock History (Admin View - Techs Can See Their Own)

**Location:** Dispatch → Time Clock History

**Steps:**
1. Technician opens Time Clock History
2. Filter to show only their entries
3. Find the entry they need to adjust
4. Click the **"Request Time Adjustment"** button (Send icon)
5. Fill out the request form
6. Submit request
7. Wait for admin approval

**Button Visibility:**
- Only shown for techs viewing their **own** entries
- Not shown if there's already a pending request for that entry
- Tech role only - other roles see direct edit buttons

---

## Time Adjustment Request Modal

When a tech clicks to request an adjustment, they see a modal with:

### Left Side: Current Times (Read-Only)
- **Clock In:** Shows current clock-in time (e.g., "7:00 AM")
- **Clock Out:** Shows current clock-out time or "Not clocked out"
- **Date:** Shows entry date (e.g., "Monday, January 22, 2026")

### Right Side: Requested Times (Editable)
- **Clock In Time:** Time picker to select new clock-in time (required)
- **Clock Out Time:** Time picker to select new clock-out time (optional - leave blank if still clocked in)

### Reason Category (Required)
Dropdown with options:
- Forgot to Clock In
- Forgot to Clock Out
- Wrong Time Entered
- System Error
- Other

### Detailed Explanation (Required)
Text area where tech must explain:
- Why they need this adjustment
- What happened
- Any relevant context

**Example:**
```
"I forgot to clock in when I arrived at 7:00 AM. I was rushing to the
morning meeting and didn't realize until lunch. My supervisor can confirm
I was here on time."
```

### Info Box
Shows explanation of the review process:
- Request will be reviewed by administrator
- Technician will receive notification when approved/denied
- If approved, time entry will be automatically updated

---

## What Happens After Submission

### 1. Request Created
```
Status: PENDING
```
- Request saved to database with status "pending"
- Entry shows "Pending Request" badge in tech's view
- Admin sees notification/alert about pending request

### 2. Admin Reviews Request

**Admin Opens Request Review Modal:**
- Sees side-by-side comparison:
  - **Current Times:** Original times
  - **Requested Times:** What tech is asking for
- Sees reason category and full explanation
- Sees who submitted and when

**Admin Options:**

#### Option A: APPROVE
1. Admin clicks "Approve Request"
2. Confirms approval
3. System automatically:
   - Updates daily_clock_entries with new times
   - Marks entry as `admin_adjusted = true`
   - Adds adjustment_reason
   - Records who approved and when
   - Changes request status to "approved"
   - **Sends notification to technician: "Your time adjustment request has been approved by admin."**

#### Option B: DENY
1. Admin enters reason for denial (required)
2. Admin clicks "Deny Request"
3. Confirms denial
4. System:
   - Marks request as "denied"
   - Records admin notes
   - Records who denied and when
   - **Sends notification to technician: "Your time adjustment request has been denied. Reason: [admin's notes]"**

---

## Technician Notifications

### When Request is Approved ✅
```
Title: "Time Adjustment Request Approved"
Body: "Your time adjustment request has been approved by admin."
Type: time_adjustment
```

**What Happens:**
- Tech receives in-app notification
- Their time entry is automatically updated with new times
- Entry shows "Admin Adjusted" badge
- Tech can see adjustment reason in entry details

---

### When Request is Denied ❌
```
Title: "Time Adjustment Request Denied"
Body: "Your time adjustment request has been denied. Reason: [admin notes]"
Type: time_adjustment
```

**What Happens:**
- Tech receives in-app notification with denial reason
- Original times remain unchanged
- Tech can submit a new request if needed (e.g., with better explanation)

---

## Request Status Badge System

In the tech's view (My Time), each entry shows status:

| Badge | Meaning | Action Available |
|-------|---------|------------------|
| **None** | No request submitted | "Request Edit" button shown |
| **⏳ Pending Request** | Request submitted, waiting for admin | No action - must wait |
| **✅ Request Approved** | Request was approved | Entry updated, no further action |
| **❌ Request Denied** | Request was denied | Can submit new request |

---

## Database Structure

### `time_adjustment_requests` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `daily_clock_entry_id` | uuid | Which clock entry this is for |
| `technician_id` | uuid | Who submitted the request |
| `current_clock_in` | timestamptz | Original clock-in time |
| `current_clock_out` | timestamptz | Original clock-out time (nullable) |
| `requested_clock_in` | timestamptz | New clock-in time requested |
| `requested_clock_out` | timestamptz | New clock-out time requested (nullable) |
| `reason_category` | text | Category (forgot_clock_in, etc.) |
| `explanation` | text | Tech's detailed explanation |
| `status` | text | pending/approved/denied/cancelled |
| `admin_notes` | text | Admin's notes when reviewing |
| `reviewed_by` | uuid | Which admin reviewed (nullable) |
| `reviewed_at` | timestamptz | When reviewed (nullable) |
| `created_at` | timestamptz | When request was created |
| `updated_at` | timestamptz | When request was last updated |

---

## Security & Permissions

### Row Level Security (RLS)

**Technicians Can:**
- ✅ View their own requests
- ✅ Create requests for their own entries
- ✅ Cancel their own pending requests
- ❌ View other people's requests
- ❌ Approve/deny any requests
- ❌ Directly edit time entries

**Admins/Office Managers Can:**
- ✅ View all requests from all techs
- ✅ Approve any request
- ✅ Deny any request
- ✅ Add admin notes
- ✅ Directly edit any time entry (bypass request system)

---

## Example Scenarios

### Scenario 1: Forgot to Clock In

```
Tech arrives at 7:00 AM for work
Gets busy and forgets to clock in
Realizes at 10:00 AM they never clocked in
Clock system shows clock-in at 10:00 AM (when they remembered)

TECH ACTION:
1. Opens My Time View
2. Clicks "Request Edit" on today's entry
3. Changes clock-in time from 10:00 AM to 7:00 AM
4. Selects reason: "Forgot to Clock In"
5. Explains: "I arrived on time but forgot to clock in until 10 AM. I was
   at the morning meeting from 7-8 AM with the whole crew."
6. Submits request

ADMIN REVIEWS:
1. Sees request in Time Clock History
2. Checks if tech was at morning meeting
3. Confirms with supervisor
4. Approves request

RESULT:
✅ Clock-in time changed to 7:00 AM
✅ Tech gets notification of approval
✅ Payroll is accurate
```

---

### Scenario 2: Wrong Time Entered

```
Tech meant to clock in at 7:00 AM
Accidentally selected 7:00 PM in the system
Didn't notice until next day

TECH ACTION:
1. Opens Time Clock History
2. Finds yesterday's entry
3. Clicks "Request Time Adjustment"
4. Changes clock-in from 7:00 PM to 7:00 AM
5. Selects reason: "Wrong Time Entered"
6. Explains: "I accidentally selected PM instead of AM when clocking in.
   Should be 7:00 AM, not 7:00 PM."
7. Submits request

ADMIN REVIEWS:
1. Sees the obvious AM/PM mistake
2. Approves request immediately

RESULT:
✅ Time corrected
✅ No payroll issues
```

---

### Scenario 3: Forgot to Clock Out

```
Tech finishes work at 5:00 PM
Leaves in a hurry
Forgets to clock out
Auto-clock-out system would clock them out at cutoff time
Tech wants to set correct clock-out time

TECH ACTION:
1. Next morning, opens My Time View
2. Sees yesterday's entry has no clock-out time
3. Clicks "Request Edit"
4. Sets clock-out time to 5:00 PM
5. Selects reason: "Forgot to Clock Out"
6. Explains: "I left at 5 PM but forgot to clock out. Had to rush to
   a family emergency. My last job was completed at 4:45 PM per the
   work order."
7. Submits request

ADMIN REVIEWS:
1. Checks work order completion times
2. Confirms last activity was 4:45 PM
3. Approves 5:00 PM clock-out
4. Adds note: "Confirmed via work order completion"

RESULT:
✅ Clock-out set to 5:00 PM
✅ Accurate hours recorded
✅ Tech gets notification
```

---

### Scenario 4: Request Denied (Insufficient Information)

```
Tech submits request to change clock-in from 8:00 AM to 7:00 AM

TECH EXPLANATION (Poor):
"Need to change time."

ADMIN REVIEWS:
1. Sees vague explanation
2. No details provided
3. Can't verify accuracy
4. Denies request
5. Admin note: "Please provide more details about why you arrived earlier
   than the system recorded. Include which supervisor can verify, or
   reference to jobs/meetings at that time."

RESULT:
❌ Request denied
❌ Tech gets notification with reason
✅ Tech can submit new request with better explanation
```

---

## Admin View - Reviewing Requests

**Time Clock History Page:**

Each entry with a pending request shows:
- 🔔 **Alert icon** next to the entry
- **"Pending Request"** badge
- **"Review Request"** button

**Clicking "Review Request" Shows:**

```
┌─────────────────────────────────────────┐
│  Time Adjustment Request Review         │
├─────────────────────────────────────────┤
│  Technician: John Smith                 │
│  Entry Date: Monday, January 22, 2026   │
│  Submitted: 1 hour ago                  │
├─────────────────────────────────────────┤
│  CURRENT TIMES          REQUESTED TIMES │
│  Clock In:  10:00 AM    Clock In:  7:00 AM
│  Clock Out: 5:00 PM     Clock Out: 5:00 PM
├─────────────────────────────────────────┤
│  Reason: Forgot to Clock In             │
│                                         │
│  Explanation:                           │
│  "I arrived on time but forgot to       │
│  clock in until 10 AM. I was at the     │
│  morning meeting from 7-8 AM with       │
│  the whole crew."                       │
├─────────────────────────────────────────┤
│  Admin Notes: [optional text box]       │
├─────────────────────────────────────────┤
│  [Deny Request]     [Approve Request]   │
└─────────────────────────────────────────┘
```

---

## Key Features

### 1. Audit Trail ✅
- All requests are logged
- Shows who requested, when, and why
- Shows who reviewed, when, and decision
- Admin notes preserved
- Original times preserved

### 2. Accountability ✅
- Techs must explain why adjustment is needed
- Admins must provide reason when denying
- All changes tracked
- Prevents unauthorized time manipulation

### 3. Fair Process ✅
- Techs can request changes for legitimate reasons
- Admins review objectively
- Clear communication via notifications
- Can resubmit if denied with better explanation

### 4. Automatic Updates ✅
- When approved, entry updates automatically
- Notification sent immediately
- No manual data entry needed
- Reduces admin workload

### 5. Prevents Abuse 🛡️
- Techs can't directly edit their own times
- All changes require admin approval
- Detailed explanation required
- Reason category tracking
- Audit trail for all adjustments

---

## Files Involved

| File | Purpose |
|------|---------|
| `TimeAdjustmentRequestModal.tsx` | Modal for submitting requests |
| `RequestReviewModal.tsx` | Modal for admins to review requests |
| `MyTimeView.tsx` | Technician's view of their time entries |
| `TimeClockHistory.tsx` | Full time clock history (all employees) |
| `20260120160000_create_time_adjustment_requests.sql` | Database schema & triggers |

---

## Benefits

### For Technicians
- ✅ Can correct honest mistakes
- ✅ Don't need admin intervention for every correction
- ✅ Self-service request submission
- ✅ Get immediate confirmation when submitted
- ✅ Get notified when reviewed
- ✅ Know exactly why if denied

### For Admins
- ✅ Full visibility into all time adjustments
- ✅ Can verify accuracy before approving
- ✅ Can deny suspicious requests
- ✅ All changes documented
- ✅ One-click approve/deny
- ✅ Automatic notification to tech

### For Company
- ✅ Accurate payroll
- ✅ Audit trail for labor compliance
- ✅ Prevents time theft
- ✅ Encourages honesty
- ✅ Reduces disputes
- ✅ Clear process for corrections

---

## Summary

**Question:** How does a tech adjust their clock in/clock out time?

**Answer:** Techs **submit a Time Adjustment Request** which must be approved by an admin:

1. **Tech opens** My Time View or Time Clock History
2. **Tech clicks** "Request Edit" or "Request Time Adjustment"
3. **Tech fills out:**
   - New clock-in time
   - New clock-out time (if applicable)
   - Reason category
   - Detailed explanation
4. **Tech submits** request (status = pending)
5. **Admin reviews** request in Time Clock History
6. **Admin approves or denies:**
   - **If approved:** Time entry updated automatically, tech notified
   - **If denied:** Original times kept, tech notified with reason
7. **Tech receives notification** with outcome

This system ensures accurate time tracking while preventing unauthorized changes and maintaining a complete audit trail.

---

**Last Updated:** January 22, 2026
**Status:** ✅ COMPLETE AND DOCUMENTED
