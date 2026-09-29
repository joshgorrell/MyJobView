/*
# Add installation date and per-service account numbers to security_contracts

1. New Columns
- `security_contracts.installation_date` (date, nullable) — the date the system was physically installed. Filled in by staff after the customer completes onboarding and the system is activated/installed.
- `security_contracts.service_account_numbers` (jsonb, nullable, default '{}') — a JSON object mapping account service keys to their corresponding account numbers. For example: {"dial_up": "12345", "telguard": "TG678", "alarmnet": "AN111", "alarm_com": "AC222"}. Each transport/monitoring service that requires an account number gets its own entry.

2. Modified Tables
- `security_contracts` — two new nullable columns added. No existing data is affected.

3. Security
- No changes to RLS policies. The table already has RLS enabled and existing policies cover the new columns automatically since they are on the same table.

4. Important Notes
- Both columns are nullable because they are populated AFTER the customer completes onboarding and the system is installed.
- `service_account_numbers` uses jsonb so we can add/remove service keys without schema changes.
- The existing `account_number` text column is retained for backward compatibility with existing contracts.
*/

ALTER TABLE security_contracts
  ADD COLUMN IF NOT EXISTS installation_date date,
  ADD COLUMN IF NOT EXISTS service_account_numbers jsonb DEFAULT '{}'::jsonb;