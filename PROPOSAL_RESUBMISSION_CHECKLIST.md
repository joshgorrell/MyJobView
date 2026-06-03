# Proposal Re-Submission with Mandatory Checklist

## Overview
When a proposal expires, sales reps must complete a mandatory verification checklist before re-submitting to customers. This ensures all information is current and accurate before giving the customer a fresh 30-day review window.

---

## ✅ Complete Feature Set

### 1. Mandatory Checklist Modal
**Appears when:** Sales rep clicks "Re-Submit to Customer" on an expired proposal

**Required Checkboxes (all must be checked):**
1. ✅ **I have reviewed all pricing and updated to current**
   - Verifies all product prices, labor rates, and material costs are current
2. ✅ **I have reviewed labor hours, task notes, and scope for accuracy**
   - Confirms installation hours, programming time, and scope descriptions are accurate
3. ✅ **I have made any necessary changes or added revision notes**
   - Ensures all requested changes are incorporated

**Optional Field:**
- **Revision Notes for Customer** (up to 500 characters)
- Customer-facing explanation of what changed
- Appears at top of proposal when customer views it
- Example: "Updated pricing to reflect current promotions. Added two additional speakers to living room based on our discussion."

**Submit Button:**
- Gray and disabled until all 3 checkboxes are checked
- Turns green and clickable when all requirements met
- Text: "Confirm & Re-Submit"

### 2. Re-Submission Process
When rep clicks "Confirm & Re-Submit":
1. ✅ Saves revision notes to database
2. ✅ Adds entry to revision history (tracks all revisions)
3. ✅ Extends expiration by 30 days
4. ✅ Increments renewal count
5. ✅ Changes status from 'expired' back to 'sent'
6. ✅ Sends email notification to customer
7. ✅ Proposal becomes visible on customer portal again

### 3. Customer Portal Display
When customer views re-submitted proposal:
- **Blue banner at top** with revision information
- Shows "Updated Proposal" badge with revision number
- Displays revision notes from sales rep
- Note: "This proposal has been updated and you have a new 30-day window to review."

### 4. Revision History Tracking
Database tracks complete revision history:
```json
[
  {
    "revision_number": 1,
    "notes": "Updated pricing to current rates",
    "resubmitted_at": "2025-11-22T10:30:00Z",
    "resubmitted_by": "user-uuid"
  },
  {
    "revision_number": 2,
    "notes": "Added equipment per customer request",
    "resubmitted_at": "2025-12-15T14:20:00Z",
    "resubmitted_by": "user-uuid"
  }
]
```

---

## Database Schema

### New Columns Added:
```sql
-- proposals table
revision_notes text                  -- Latest revision notes (customer-facing)
revision_history jsonb DEFAULT '[]'  -- Complete history of all revisions
```

### Trigger Function:
- Automatically adds revision entry to history when proposal is renewed
- Captures: revision number, notes, timestamp, user who resubmitted

---

## UI Components

### ResubmitProposalModal.tsx
**New standalone component**

**Features:**
- Full-screen modal with dark theme
- Three required checkboxes with descriptions
- Visual checkmarks when items are checked
- Character counter for revision notes (500 max)
- Disabled/enabled state management
- Loading states during submission
- Warning message if checklist incomplete

**Visual Design:**
- Clean, professional layout
- Color-coded: Gray → Green transition
- Icon indicators (AlertCircle, CheckCircle)
- Smooth transitions and hover states
- Responsive design

### ProposalSummary.tsx Updates
**Smart Button Display:**
- If proposal is **expired**: Shows "Re-Submit to Customer" (green)
- If proposal is **sent** (not expired): Shows "Renew for 30 Days" (blue)

**Behavior:**
- Expired → Opens checklist modal
- Not expired → Direct renewal (no checklist needed)

### PortalProposalDetail.tsx Updates
**Revision Banner:**
- Only shows if `revision_notes` exists and `renewal_count > 0`
- Blue theme with icon
- Shows revision number badge
- Displays customer-facing notes
- Helpful message about fresh 30-day window

---

## User Workflows

### Scenario 1: Expired Proposal Re-Submission
1. **Sales Rep Side:**
   - Opens expired proposal
   - Sees red "Expired" badge
   - Reviews pricing, updates products if needed
   - Reviews labor hours, adjusts if needed
   - Clicks "Re-Submit to Customer" button
   - Modal appears with checklist
   - Checks all 3 required boxes
   - Adds revision notes: "Updated pricing for 2025. Added surge protector per your request."
   - Clicks green "Confirm & Re-Submit" button
   - Modal closes, proposal status updates

2. **System Actions:**
   - Status: 'expired' → 'sent'
   - expires_at: NOW + 30 days
   - renewal_count: increments by 1
   - revision_notes: saved
   - revision_history: entry added
   - Email sent to customer

3. **Customer Side:**
   - Receives email notification
   - Logs into portal
   - Sees proposal with blue banner at top
   - Reads: "Updated Proposal - Revision #1"
   - Sees notes: "Updated pricing for 2025. Added surge protector per your request."
   - Reviews updated proposal
   - Has fresh 30 days to decide

### Scenario 2: Extending Before Expiration
1. **Sales Rep Side:**
   - Opens proposal with 2 days remaining
   - Clicks "Renew for 30 Days" button
   - No modal appears (not expired)
   - Instant renewal, no checklist required
   - Expiration extended by 30 days

2. **Why No Checklist?**
   - Proposal hasn't expired yet
   - Customer is still reviewing original version
   - Just needs more time
   - No changes made, so no verification needed

### Scenario 3: Multiple Re-Submissions
1. **First Re-Submission (Revision #1):**
   - Expired after 30 days
   - Rep completes checklist
   - Notes: "Updated pricing to current rates"
   - Customer gets fresh 30 days

2. **Second Re-Submission (Revision #2):**
   - Expired after another 30 days
   - Rep completes checklist again
   - Notes: "Added equipment per customer's new requirements"
   - Customer gets another 30 days
   - Portal shows "Revision #2"
   - History tracks both revisions

---

## Validation & Error Handling

### Modal Validation:
- ✅ Cannot submit until all checkboxes checked
- ✅ Submit button visually disabled (gray)
- ✅ Warning message shows until complete
- ✅ Character limit enforced (500 chars)
- ✅ Character counter updates live

### Database Validation:
- ✅ Revision history stored as JSONB array
- ✅ Automatic timestamp tracking
- ✅ User tracking via auth.uid()
- ✅ Atomic updates (all or nothing)

### UI States:
- ✅ Loading states during submission
- ✅ Success feedback after submission
- ✅ Error handling with user-friendly messages
- ✅ Modal dismissal after success

---

## Benefits

### For Sales Reps:
- ✅ Forces verification before re-sending
- ✅ Prevents sending outdated information
- ✅ Provides structure for quality control
- ✅ Tracks revision history for reference
- ✅ Easy to add customer-facing notes

### For Customers:
- ✅ Always see current, accurate information
- ✅ Clear communication about what changed
- ✅ Fresh review window after updates
- ✅ Transparency with revision numbers
- ✅ Professional presentation

### For Management:
- ✅ Quality control mechanism built in
- ✅ Audit trail of all revisions
- ✅ Track how many times proposals are resubmitted
- ✅ Identify problematic proposals
- ✅ Monitor sales process efficiency

---

## Analytics & Reporting Queries

### Count proposals by revision number:
```sql
SELECT
  renewal_count,
  COUNT(*) as proposal_count
FROM proposals
WHERE status IN ('sent', 'approved', 'expired')
GROUP BY renewal_count
ORDER BY renewal_count;
```

### List frequently re-submitted proposals:
```sql
SELECT
  proposal_number,
  title,
  renewal_count,
  status,
  created_at
FROM proposals
WHERE renewal_count >= 3
ORDER BY renewal_count DESC;
```

### Average time between submissions:
```sql
SELECT
  proposal_number,
  jsonb_array_length(revision_history) as total_revisions,
  created_at,
  last_renewed_at
FROM proposals
WHERE renewal_count > 0;
```

### View revision history for a proposal:
```sql
SELECT
  proposal_number,
  revision_history
FROM proposals
WHERE id = 'proposal-uuid-here';
```

---

## Configuration Options

### Checklist Items
Currently hardcoded in component. Could be made dynamic:
```sql
-- Future enhancement
CREATE TABLE proposal_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  description text,
  required boolean DEFAULT true,
  sort_order integer,
  is_active boolean DEFAULT true
);
```

### Revision Notes Character Limit
Currently: 500 characters
Location: `ResubmitProposalModal.tsx` line with `maxLength={500}`

### Email Template
Edge function: `send-proposal-email`
Pass parameter: `isResubmission: true`
Can customize email template for re-submissions vs initial sends

---

## Testing Checklist

### Sales Rep Testing:
- ✅ Create and send proposal
- ✅ Manually expire it (set expires_at to past)
- ✅ Verify "Re-Submit to Customer" button appears
- ✅ Click button, verify modal opens
- ✅ Try clicking submit without checkboxes → stays disabled
- ✅ Check all boxes, verify button turns green
- ✅ Add revision notes with 500+ characters → truncates at 500
- ✅ Click "Confirm & Re-Submit"
- ✅ Verify modal closes
- ✅ Verify proposal status is 'sent'
- ✅ Verify expires_at is +30 days from now
- ✅ Verify renewal_count incremented
- ✅ Check database for revision_history entry

### Customer Portal Testing:
- ✅ Log in as customer
- ✅ View re-submitted proposal
- ✅ Verify blue banner appears at top
- ✅ Verify revision number shows correctly
- ✅ Verify revision notes display correctly
- ✅ Verify fresh expiration countdown shows
- ✅ Re-submit again (Revision #2)
- ✅ Verify revision number updates to 2

### Edge Cases:
- ✅ Empty revision notes (should work fine)
- ✅ Very long revision notes (truncates at 500)
- ✅ Multiple rapid re-submissions
- ✅ Re-submission of proposal that was never expired
- ✅ Database connection failure during submission

---

## Summary

✅ **Mandatory 3-checkbox verification** before re-submission
✅ **Optional revision notes** (500 characters max)
✅ **Visual feedback** (gray → green button transition)
✅ **Automatic 30-day extension** after verification
✅ **Customer portal banner** showing revision info
✅ **Complete revision history** tracking in database
✅ **Email notification** on re-submission
✅ **Smart button display** (expired = re-submit, active = renew)
✅ **Professional modal design** with clear UX
✅ **Error handling and validation** at every step

**Build Status:** ✅ Successful
**Ready for Production:** ✅ Yes

All features implemented, tested, and documented!
