# Midnight Session Cleanup System

## Overview

The midnight session cleanup system automatically closes all active user sessions at midnight, **except** for sessions where the user has been active within the last 5 minutes. This ensures that:

- Stale sessions from users who forgot to log out are cleaned up daily
- Active users are not interrupted
- Session tracking data remains accurate

## Components

### 1. Database Function
- **Function**: `midnight_session_cleanup()`
- **Location**: Migration `20260203020000_create_midnight_session_cleanup.sql`
- **What it does**:
  - Finds all active sessions where `last_activity` is older than 5 minutes
  - Sets `is_active = false` and `session_end = now()` for those sessions
  - Returns a JSON result with the count of sessions closed

### 2. Edge Function
- **Function**: `midnight-session-cleanup`
- **Location**: `supabase/functions/midnight-session-cleanup/index.ts`
- **What it does**:
  - Calls the database function `midnight_session_cleanup()`
  - Logs the results
  - Returns success/failure status

## Setup Instructions

### Option 1: Using Supabase Platform Cron Jobs (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to **Database** → **Cron Jobs** (or Edge Functions → Cron)
3. Create a new cron job with these settings:
   - **Name**: `midnight-session-cleanup`
   - **Schedule**: `0 0 * * *` (runs at midnight every day)
   - **SQL Command**:
     ```sql
     SELECT net.http_post(
       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/midnight-session-cleanup',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
       ),
       body := '{}'::jsonb
     );
     ```
   - Replace `YOUR_PROJECT_REF` with your actual Supabase project reference

### Option 2: Using External Cron Service

Use a service like **cron-job.org**, **EasyCron**, or **GitHub Actions** to call the edge function:

**Endpoint**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/midnight-session-cleanup`

**Method**: POST

**Headers**:
- `Content-Type: application/json`

**Schedule**: Daily at midnight (adjust for your timezone)

Example cURL command:
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/midnight-session-cleanup \
  -H "Content-Type: application/json"
```

### Option 3: GitHub Actions

Create `.github/workflows/midnight-cleanup.yml`:

```yaml
name: Midnight Session Cleanup
on:
  schedule:
    - cron: '0 0 * * *'  # Runs at midnight UTC daily
  workflow_dispatch:  # Allows manual trigger

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Call Cleanup Function
        run: |
          curl -X POST ${{ secrets.SUPABASE_URL }}/functions/v1/midnight-session-cleanup \
            -H "Content-Type: application/json"
```

## How It Works

1. **Scheduled Trigger**: At midnight, the cron job triggers the edge function
2. **Activity Check**: The function checks all active sessions
3. **5-Minute Grace Period**: Sessions with activity in the last 5 minutes are kept active
4. **Cleanup**: All other active sessions are closed
5. **Logging**: Results are logged and returned

## Example Response

```json
{
  "success": true,
  "message": "Midnight session cleanup executed successfully",
  "result": {
    "success": true,
    "sessions_closed": 15,
    "cleanup_time": "2024-02-03T00:00:01.234Z",
    "message": "Closed 15 inactive sessions at midnight"
  }
}
```

## Testing

You can manually test the cleanup function at any time:

### Test via API (using cURL):
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/midnight-session-cleanup \
  -H "Content-Type: application/json"
```

### Test via Database:
```sql
SELECT midnight_session_cleanup();
```

## Monitoring

Monitor the cleanup in several ways:

1. **Check Edge Function Logs**:
   - Go to Supabase Dashboard → Edge Functions → midnight-session-cleanup → Logs

2. **Query Session Data**:
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE is_active = true) as active_sessions,
     COUNT(*) FILTER (WHERE is_active = false AND session_end::date = CURRENT_DATE) as closed_today
   FROM user_sessions;
   ```

3. **View Recent Cleanups** (if you add logging):
   ```sql
   SELECT
     session_end::date as cleanup_date,
     COUNT(*) as sessions_closed
   FROM user_sessions
   WHERE session_end IS NOT NULL
     AND session_end > NOW() - INTERVAL '7 days'
   GROUP BY session_end::date
   ORDER BY cleanup_date DESC;
   ```

## Customization

### Change the Inactivity Threshold

To change the 5-minute grace period, edit the migration function:

```sql
-- Change INTERVAL '5 minutes' to your desired value
WHERE is_active = true
  AND last_activity < now() - INTERVAL '10 minutes'  -- Example: 10 minutes
```

### Different Cleanup Times

Adjust the cron schedule:
- `0 0 * * *` - Midnight every day
- `0 2 * * *` - 2 AM every day
- `0 0 * * 0` - Midnight every Sunday
- `0 0 1 * *` - Midnight on the 1st of every month

### Timezone Considerations

Supabase cron jobs run in UTC. To run at midnight in your local timezone:
- PST (UTC-8): Use `0 8 * * *` (8 AM UTC = midnight PST)
- EST (UTC-5): Use `0 5 * * *` (5 AM UTC = midnight EST)
- CST (UTC-6): Use `0 6 * * *` (6 AM UTC = midnight CST)

## Troubleshooting

**Sessions not being cleaned up?**
- Verify the cron job is running (check logs)
- Ensure the edge function is deployed
- Check that users are properly updating their `last_activity` timestamp

**Too many sessions being closed?**
- Verify your application is calling `update_session_activity()` regularly
- Increase the 5-minute threshold if needed

**Want to exclude certain users?**
- Modify the function to add exclusion logic based on user role or other criteria
