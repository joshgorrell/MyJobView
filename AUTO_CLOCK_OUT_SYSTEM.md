# Automatic Clock-Out System

## Overview

The system automatically clocks out employees who forget to clock out at the end of their shift. This prevents payroll issues and ensures accurate time tracking.

## Features

- **Automatic Detection**: Identifies users who forgot to clock out from previous days
- **Configurable Settings**: Admins can enable/disable, set business hours, and configure penalties
- **Points Penalty**: Deducts points from users who forget to clock out (configurable)
- **User Notifications**: Sends notifications to users when auto clock-out occurs
- **Admin Dashboard**: View pending auto clock-outs and manually trigger the process
- **Audit Trail**: Marks entries as admin-adjusted with reason for transparency

## How It Works

1. **Detection**: System checks for clock entries from previous days that are still in "clocked_in" status
2. **Clock-Out Time**: Uses either the user's `standard_end_time` or the company's `business_day_end_time`
3. **Automatic Processing**: Can be run manually by admins or scheduled via cron job
4. **Notification**: User receives notification about auto clock-out and points penalty
5. **Record Keeping**: Entry is marked as admin-adjusted with reason "Auto-clocked out: User forgot to clock out"

## Admin Configuration

Navigate to **Admin > Time Clock Management > Auto Clock-Out** button

### Settings:

- **Enable Auto Clock-Out**: Toggle the automatic clock-out system on/off
- **Business Day End Time**: Default clock-out time (e.g., 6:00 PM)
- **Penalty Points**: Points deducted when user forgets (default: -15 points)

### Manual Trigger:

The admin panel shows:
- Number of users who forgot to clock out
- Details of each pending auto clock-out
- Button to manually run the auto clock-out process

## Automation

To run automatically, set up a cron job or scheduled task:

### Using pg_cron (PostgreSQL Extension):

```sql
-- Run every day at 2:00 AM
SELECT cron.schedule(
  'auto-clock-out-forgotten',
  '0 2 * * *',
  $$SELECT auto_clock_out_forgotten_entries()$$
);
```

### Using External Cron:

```bash
# Run daily at 2:00 AM
0 2 * * * curl -X POST https://your-api.com/run-auto-clockout
```

### Using Supabase Edge Function:

Create an edge function that calls `auto_clock_out_forgotten_entries()` and trigger it via external scheduler.

## Database Function

The core function is `auto_clock_out_forgotten_entries()`:

```sql
SELECT * FROM auto_clock_out_forgotten_entries();
```

Returns:
- `entries_processed`: Number of entries auto-clocked out
- `technician_ids`: Array of affected user IDs
- `entry_ids`: Array of affected entry IDs

## Preview Pending Clock-Outs

Query the view to see who will be affected:

```sql
SELECT * FROM entries_pending_auto_clock_out;
```

## User Impact

When auto clock-out occurs, users will:
1. See their clock entry marked as "clocked_out" with admin adjustment flag
2. Receive a notification explaining what happened
3. Have points deducted (configurable penalty)
4. See the adjustment reason in their time clock history

## Best Practices

1. **Set Reasonable Business Hours**: Configure `business_day_end_time` to match your actual closing time
2. **Adjust Penalties Appropriately**: Start with a small penalty and adjust based on behavior
3. **Run During Off-Hours**: Schedule auto clock-out to run after business hours (e.g., 2 AM)
4. **Monitor Regularly**: Check the admin panel to see who frequently forgets
5. **Communicate with Staff**: Inform employees about the system and consequences

## Troubleshooting

### Auto Clock-Out Not Running

- Check that `auto_clock_out_enabled` is true in company_settings
- Verify cron job or scheduler is configured and running
- Check database logs for errors

### Incorrect Clock-Out Times

- Verify user's `standard_end_time` is set correctly in their profile
- Check `business_day_end_time` in company settings
- Admins can manually adjust entries after auto clock-out

### Points Not Deducting

- Verify `forgot_clock_out_penalty_points` is set (should be negative)
- Check that points system is enabled
- Review `clock_in_rewards_log` table for entries
