/*
# Add monitoring flag to security contracts

1. Modified Tables
- `security_contracts`
  - Added `is_monitoring` (boolean, default false) — indicates whether the system
    actually calls a monitoring center when the alarm goes off. This is distinct
    from the account_services checkboxes (Dial-Up, Telguard, etc.) which describe
    the communication method, not whether central-station monitoring is active.
  - The existing `account_number` text column is reused to store the monitoring
    center account number when monitoring is enabled.

2. Security
- No RLS policy changes. The column inherits the existing security_contracts RLS.
*/

ALTER TABLE security_contracts
  ADD COLUMN IF NOT EXISTS is_monitoring boolean NOT NULL DEFAULT false;
