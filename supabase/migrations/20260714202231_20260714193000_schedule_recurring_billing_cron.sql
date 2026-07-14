/*
# Schedule Daily Recurring Billing Cron Job

## Purpose
Schedules a daily pg_cron job at 6:00 AM UTC to execute the `generate_recurring_invoices()`
database function. This function finds all active recurring subscriptions with
`next_billing_date <= CURRENT_DATE` and `auto_invoice = true`, generates invoices,
creates tracking rows, and advances the billing cycle.

## How It Works
- Runs daily at 6:00 AM UTC (0 6 * * *)
- Calls `SELECT generate_recurring_invoices();`
- The function handles all error cases internally and returns a summary
*/

SELECT cron.schedule(
  'generate-recurring-invoices-daily',
  '0 6 * * *',
  $$
    SELECT generate_recurring_invoices();
  $$
);
