# QuickBooks Online Integration Setup Guide

## Overview

This guide walks you through setting up QuickBooks Online integration with your MyJobView system in **production mode** with **manual controls** to ensure safe operation without affecting your live QuickBooks data.

## Safety Features

✅ **Manual Mode by Default** - No automatic writes to QuickBooks
✅ **Read-Only Testing** - Safely test connection with fetch operations
✅ **Explicit User Actions** - All write operations require button clicks
✅ **Comprehensive Logging** - Track all sync operations in database
✅ **Rollback Capability** - Local changes can be reverted

---

## Step 1: QuickBooks Developer Portal Configuration

### 1.1 Access Your App Dashboard

1. Go to [QuickBooks Developer Dashboard](https://developer.intuit.com/app/developer/dashboard)
2. Sign in with your Intuit Developer account
3. Select your existing app or create a new one

### 1.2 Configure Production Keys

1. Navigate to **Keys & OAuth** section
2. Copy your **Production Client ID**
3. Copy your **Production Client Secret**
4. Keep these credentials secure

### 1.3 Set Redirect URI

1. In the **Redirect URIs** section, add:
   ```
   https://bqtsuzvuvqvgidipbsis.supabase.co/functions/v1/quickbooks-oauth-callback
   ```
2. Click **Save**
3. Verify the URI shows as "Active"

### 1.4 Verify OAuth Scopes

Ensure your app has the following scope enabled:
- `com.intuit.quickbooks.accounting`

---

## Step 2: Local Environment Configuration

### 2.1 Update .env File

Open your `.env` file and update the QuickBooks credentials:

```env
# QuickBooks Online Integration (Production Mode)
VITE_QUICKBOOKS_CLIENT_ID=your_actual_production_client_id
VITE_QUICKBOOKS_CLIENT_SECRET=your_actual_production_client_secret
```

**Replace** `your_actual_production_client_id` and `your_actual_production_client_secret` with the values from Step 1.2.

### 2.2 Verify Other Environment Variables

Ensure these are correctly set:
```env
VITE_SUPABASE_URL=https://bqtsuzvuvqvgidipbsis.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## Step 3: Supabase Secrets Configuration

### 3.1 Set Edge Function Secrets

In your Supabase Dashboard:

1. Navigate to **Project Settings** → **Edge Functions**
2. Add the following secrets:

```
QUICKBOOKS_CLIENT_ID=your_actual_production_client_id
QUICKBOOKS_CLIENT_SECRET=your_actual_production_client_secret
QUICKBOOKS_REDIRECT_URI=https://bqtsuzvuvqvgidipbsis.supabase.co/functions/v1/quickbooks-oauth-callback
QUICKBOOKS_ENVIRONMENT=production
```

### 3.2 Optional: Payment Webhook Token

If you plan to use QuickBooks payment webhooks:
```
QUICKBOOKS_WEBHOOK_TOKEN=your_secure_random_token
```

---

## Step 4: Safe Connection Testing (Read-Only)

### 4.1 Connect to QuickBooks

1. Log into MyJobView as an administrator
2. Navigate to **Admin** → **Settings** → **Integrations**
3. Find the **QuickBooks Online Integration** section
4. Click **Connect to QuickBooks**
5. Sign in to your QuickBooks Online account
6. Review and **Authorize** the connection
7. You'll be redirected back to MyJobView

### 4.2 Verify Connection

You should see:
- ✅ Green "Connected" badge
- Your QuickBooks Company ID displayed
- "Your QuickBooks account is connected and ready to use"

### 4.3 Test Read-Only Fetch

1. Click **Fetch from QuickBooks** button
2. Wait for the operation to complete
3. Review the results showing:
   - Total customers fetched
   - Complete customers (ready to import)
   - Partial customers (need review)
   - Minimal customers (insufficient data)

**Important:** This operation is READ-ONLY and does not affect your QuickBooks data.

---

## Step 5: Configure Manual Sync Settings

### 5.1 Verify Manual Mode

In the **Bidirectional Sync** section, ensure both checkboxes are **UNCHECKED**:

- ⬜ **Auto-Import from QuickBooks** - OFF
- ⬜ **Auto-Sync to QuickBooks** - OFF

This ensures all operations require manual approval.

### 5.2 Review Customer Sync Status

Click **Review Pending Customers** to see staged customers from QuickBooks:

- **Complete Customers** - Have all required data (name, email, phone, address)
- **Partial Customers** - Missing some optional data
- **Minimal Customers** - Missing critical data

---

## Step 6: Manual Import Testing

### 6.1 Import Individual Customers

1. Click **Review Pending Customers**
2. Browse the customer list
3. Select customers you want to import
4. Click **Import Selected** on individual customers
5. Verify customers appear in your Contacts

**Safety Note:** This writes to your local database only, not QuickBooks.

### 6.2 Verify Import Success

1. Navigate to **Sales** → **Contacts**
2. Find the imported customers
3. Verify data accuracy
4. Check that `qbo_customer_id` is populated

---

## Step 7: Manual Sync to QuickBooks

### 7.1 Test Single Lead Sync

1. Navigate to **Sales** → **Pipeline**
2. Select a test lead (or create a new one)
3. Click the **Sync to QuickBooks** button
4. Wait for confirmation
5. Verify customer created in QuickBooks

**Warning:** This WRITES to QuickBooks. Test with a single lead first.

### 7.2 Verify in QuickBooks

1. Log into QuickBooks Online
2. Navigate to **Sales** → **Customers**
3. Find the synced customer
4. Verify data accuracy

---

## Step 8: Monitor Sync Operations

### 8.1 Review Sync Logs

All sync operations are logged in the `quickbooks_sync_logs` table:

```sql
SELECT
  created_at,
  direction,
  operation,
  entity_type,
  status,
  error_message
FROM quickbooks_sync_logs
ORDER BY created_at DESC
LIMIT 20;
```

### 8.2 Check Sync Status

Monitor sync status on contacts:
- `pending` - Queued for sync
- `synced` - Successfully synced
- `failed` - Sync error occurred
- `skipped` - Insufficient data

---

## Step 9: Enable Auto-Sync (Optional)

Once you're comfortable with manual operations, you can enable automatic sync:

### 9.1 Enable Auto-Import

Check **Auto-Import from QuickBooks** to automatically import customers with complete data when you click "Fetch from QuickBooks".

### 9.2 Enable Auto-Sync

Check **Auto-Sync to QuickBooks** to automatically create QuickBooks customers when you add contacts with complete data.

**Important:** Only enable after thorough testing with manual mode.

---

## Troubleshooting

### Connection Issues

**Problem:** "QuickBooks not connected" error
**Solution:**
- Verify CLIENT_ID and CLIENT_SECRET are correct
- Check redirect URI matches exactly
- Ensure app is in production mode

### Token Expiration

**Problem:** Operations fail with authentication error
**Solution:**
- Tokens are automatically refreshed
- If refresh fails, disconnect and reconnect
- Verify CLIENT_SECRET is correct

### Sync Failures

**Problem:** Customer sync fails
**Solution:**
- Check sync logs for error details
- Verify required fields are present (name + email or phone)
- Ensure QuickBooks customer doesn't already exist
- Check for duplicate display names

### Data Mismatch

**Problem:** Customer data differs between systems
**Solution:**
- QuickBooks is the source of truth
- Re-fetch from QuickBooks to get latest data
- Review staged customers before importing
- Manually update if needed

---

## Important Safety Notes

### Production Mode Safeguards

1. **Manual Mode Default** - Both auto-sync options default to OFF
2. **Read-Only Testing** - Fetch operations are always safe
3. **Explicit Actions** - All writes require button clicks
4. **Comprehensive Logging** - All operations are tracked
5. **Local Staging** - Review before importing to local database
6. **No Automatic Writes** - Never writes to QuickBooks without user action

### Best Practices

1. ✅ Always test with manual mode first
2. ✅ Fetch customers before enabling auto-import
3. ✅ Review staged customers carefully
4. ✅ Test single-lead sync before bulk operations
5. ✅ Monitor sync logs regularly
6. ✅ Keep backups of both systems
7. ✅ Train team on sync workflow

### Data Safety

- **QuickBooks Data** - Never modified without explicit user action
- **Local Database** - Can be rolled back if needed
- **Staged Customers** - Safe buffer before import
- **Sync Logs** - Audit trail of all operations
- **Token Security** - Stored encrypted in Supabase

---

## Support

If you encounter issues:

1. Check the `quickbooks_sync_logs` table for error details
2. Review Supabase Edge Function logs
3. Verify QuickBooks Developer Dashboard settings
4. Contact support with sync log entries

---

## Summary

You've successfully configured QuickBooks integration with:

- ✅ Production QuickBooks credentials
- ✅ Manual sync controls for safety
- ✅ Read-only testing capability
- ✅ Comprehensive logging and monitoring
- ✅ Ability to enable auto-sync when ready

Your QuickBooks data is safe with manual controls enabled. Test thoroughly before enabling automatic operations.
