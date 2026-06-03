# Proposal Expiration & Customer Portal System

## Overview
Proposals automatically expire 30 days after being sent to customers. Sales reps can renew proposals to extend them for another 30 days. Customers access proposals through the customer portal.

---

## ✅ Features Implemented

### 1. Automatic 30-Day Expiration
- When a proposal status changes to "sent", it automatically expires 30 days later
- `expires_at` timestamp is set automatically
- Visual countdown shows days remaining
- Color-coded warnings:
  - **Green**: More than 7 days remaining
  - **Orange**: 7 days or less remaining
  - **Red**: Expired

### 2. Renewal System for Sales Reps
- **Renew Button** appears in proposal summary panel when proposal is sent or expired
- Extends expiration by 30 days with one click
- Tracks renewal history:
  - `renewal_count`: Number of times renewed
  - `last_renewed_at`: Last renewal timestamp
- Can renew even after expiration (reactivates the proposal)

### 3. Auto-Expire Function
- Database function `expire_old_proposals()` automatically marks expired proposals
- Should be run daily via cron job or scheduler
- Changes status from 'sent' to 'expired' when `expires_at` passes

### 4. Send to Portal with Email
- **"Send to Portal & Email"** button replaces old send button
- Does three things:
  1. Changes status to 'sent' (triggers 30-day expiration)
  2. Makes proposal visible on customer portal
  3. Sends email notification to customer (via edge function)

### 5. Customer Portal Integration
- Customers only see proposals that are:
  - Status: 'sent', 'approved', or 'declined' (NOT draft or expired)
  - Linked to their contact record
- Shows expiration countdown on each proposal
- Color-coded expiration badges
- Displays renewal count if renewed

---

## Database Schema

### New Columns on `proposals` table:
```sql
- expires_at (timestamptz)      -- When proposal expires
- last_renewed_at (timestamptz) -- Last renewal timestamp
- renewal_count (integer)       -- Number of renewals
```

### Status Values:
- `draft` - Being worked on, not visible to customer
- `sent` - Active on portal, expires in 30 days
- `expired` - Past expiration date, hidden from portal
- `approved` - Customer accepted
- `declined` - Customer rejected

---

## Database Functions

### `set_proposal_expiration()`
**Trigger**: Automatically runs when proposal status changes to 'sent'
- Sets `expires_at` to NOW + 30 days
- Sets `sent_at` to NOW

### `expire_old_proposals()`
**Manual/Cron**: Should be run daily
```sql
SELECT expire_old_proposals();
```
- Updates all 'sent' proposals past `expires_at` to 'expired' status

### `renew_proposal(proposal_id uuid)`
**Called by**: Sales reps via UI
```sql
SELECT renew_proposal('proposal-uuid-here');
```
- Extends `expires_at` by 30 days
- Increments `renewal_count`
- Sets `last_renewed_at` to NOW
- Changes 'expired' back to 'sent' if needed

---

## UI Components Updated

### ProposalSummary.tsx (Right Panel)
**New Features:**
- Expiration status card shows:
  - Days remaining / Expired status
  - Expiration date
  - Renewal count
  - Color-coded warning levels
- **"Renew for 30 Days"** button
- **"Send to Portal & Email"** button
- Loading states for sending/renewing

**Visual Flow:**
1. Draft proposal → "Send to Portal & Email" button visible
2. Click send → Status becomes 'sent', expires_at set to +30 days
3. Expiration card appears showing countdown
4. At any time → Click "Renew for 30 Days" to extend
5. After expiration → Can still renew to reactivate

### PortalProposals.tsx (Customer View)
**New Features:**
- Only shows non-draft, non-expired proposals
- Expiration badge on each proposal card
- Color-coded based on days remaining
- Shows renewal count: "Renewed 2×"
- Real-time countdown display

**Customer Experience:**
- Sees active proposals with clear expiration info
- Can track how much time they have to review
- Cannot see expired proposals (hidden automatically)

---

## Workflow Examples

### Scenario 1: New Proposal
1. Sales rep creates proposal (status: draft)
2. Rep clicks "Send to Portal & Email"
3. Status → 'sent', expires_at → +30 days
4. Email sent to customer with portal link
5. Customer logs into portal, sees proposal with "30 days remaining"
6. Customer reviews over next few weeks
7. At day 25, badge turns orange "5 days remaining"
8. Customer accepts → status → 'approved'

### Scenario 2: Needs More Time
1. Proposal has 2 days remaining (orange warning)
2. Customer calls: "Need more time to review"
3. Sales rep opens proposal, clicks "Renew for 30 Days"
4. expires_at extended by 30 days, renewal_count = 1
5. Customer has 30 more days to review
6. Badge shows "30 days remaining (Renewed 1×)"

### Scenario 3: Expired Proposal
1. Proposal expires (status → 'expired')
2. Customer cannot see it on portal anymore
3. Customer calls about the expired proposal
4. Sales rep opens proposal, sees red "Expired" badge
5. Rep clicks "Renew for 30 Days"
6. Status → 'sent', expires_at → +30 days, renewal_count = 1
7. Proposal reappears on customer portal

---

## Email Notification

Edge function: `send-proposal-email`
- Triggered when "Send to Portal & Email" is clicked
- Sends email to contact's email address
- Includes:
  - Proposal number and title
  - Total amount
  - Link to customer portal
  - Expiration date (30 days)
  - Login instructions

---

## Maintenance & Monitoring

### Daily Cron Job (Recommended)
Set up a daily scheduled job to run:
```sql
SELECT expire_old_proposals();
```

**Options:**
1. Supabase Database Webhooks
2. External cron service (calls Supabase function)
3. Edge Function with scheduled trigger

### Monitoring Queries

**Count proposals expiring soon:**
```sql
SELECT COUNT(*)
FROM proposals
WHERE status = 'sent'
AND expires_at < NOW() + INTERVAL '7 days';
```

**List expired proposals:**
```sql
SELECT proposal_number, title, expires_at, renewal_count
FROM proposals
WHERE status = 'expired'
ORDER BY expires_at DESC;
```

**Renewal statistics:**
```sql
SELECT
  AVG(renewal_count) as avg_renewals,
  MAX(renewal_count) as max_renewals,
  COUNT(*) FILTER (WHERE renewal_count > 0) as renewed_proposals
FROM proposals
WHERE status IN ('sent', 'approved', 'expired');
```

---

## Testing Checklist

### Sales Rep Side:
- ✅ Create draft proposal
- ✅ Click "Send to Portal & Email"
- ✅ Verify expires_at is set to +30 days
- ✅ See expiration countdown in summary panel
- ✅ Click "Renew for 30 Days"
- ✅ Verify expires_at extended, renewal_count incremented
- ✅ Manually set expires_at to past date
- ✅ Run expire_old_proposals() function
- ✅ Verify status changed to 'expired'
- ✅ Renew expired proposal, verify it reactivates

### Customer Portal Side:
- ✅ Log in as customer
- ✅ See sent proposals with expiration badges
- ✅ Verify draft proposals are hidden
- ✅ Verify expired proposals are hidden
- ✅ See color coding (green/orange/red)
- ✅ See renewal count if renewed
- ✅ Verify expired proposals disappear from portal

---

## Configuration

### Expiration Duration
Currently hardcoded to 30 days. To change:

**In migration file:**
```sql
NEW.expires_at := NOW() + INTERVAL '30 days';
```

**In renew function:**
```sql
expires_at = NOW() + INTERVAL '30 days'
```

**Recommendation:** Add to company_settings table:
```sql
ALTER TABLE company_settings
ADD COLUMN proposal_expiration_days integer DEFAULT 30;
```

---

## Next Steps (Optional Enhancements)

1. **Email Reminders**
   - Send reminder 7 days before expiration
   - Send reminder 1 day before expiration

2. **Automatic Renewal Rules**
   - Auto-renew if customer has viewed but not responded
   - Auto-renew for VIP customers

3. **Analytics Dashboard**
   - Track average time to approval
   - Monitor renewal rates
   - Identify proposals that need follow-up

4. **Customer Portal Notifications**
   - Show banner when proposal is expiring soon
   - Email notification when proposal expires

5. **Approval Workflow**
   - Require manager approval for renewals
   - Track why proposals are being renewed

---

## Summary

✅ **Automatic 30-day expiration** when proposals are sent
✅ **Renewal system** for sales reps (extend by 30 days)
✅ **Customer portal integration** with expiration display
✅ **Email notifications** when proposals are sent
✅ **Expired proposal handling** with auto-expire function
✅ **Visual indicators** for expiration status (green/orange/red)
✅ **Renewal tracking** with count and timestamp

All features are implemented, tested, and ready to use!
