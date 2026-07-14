/*
# Generalize Security Contracts into Service Agreements

## Summary
Adds agreement_type, system_type, and related columns to the security_contracts table
to support three types of service agreements: monitoring, maintenance, and equipment warranty.
All existing rows are backfilled as monitoring agreements on security systems.

## New Columns on security_contracts
- agreement_type: 'monitoring' | 'maintenance' | 'equipment_warranty' (default 'monitoring')
- system_type: 'security' | 'surveillance' | 'access_control' | 'audio_video' | 'automation' | 'networking' | 'lighting_control' | 'other' (default 'security')
- warranty_start_date: date (nullable) — start of warranty coverage period
- warranty_end_date: date (nullable) — end of warranty coverage period
- service_schedule: text (nullable) — maintenance inspection cadence ('quarterly', 'semi_annual', 'annual')
- billing_frequency_override: text (nullable) — 'monthly' or 'yearly' per agreement
- cancellation_notice_days: integer (default 30) — days before renewal to cancel

## CHECK Constraints
- agreement_type must be one of the three valid values
- system_type must be one of the eight valid values
- billing_frequency_override must be 'monthly' or 'yearly' if set
- maintenance and equipment_warranty agreements must have system_type set (enforced via app logic)

## Backfill
All existing rows get agreement_type='monitoring', system_type='security', billing_frequency_override='monthly', cancellation_notice_days=30

## Security
No RLS policy changes needed — existing table-level policies cover new columns automatically.
*/

-- Add agreement_type column
ALTER TABLE security_contracts ADD COLUMN IF NOT EXISTS agreement_type text DEFAULT 'monitoring';

-- Add system_type column
ALTER TABLE security_contracts ADD COLUMN IF NOT EXISTS system_type text DEFAULT 'security';

-- Add warranty date columns
ALTER TABLE security_contracts ADD COLUMN IF NOT EXISTS warranty_start_date date;
ALTER TABLE security_contracts ADD COLUMN IF NOT EXISTS warranty_end_date date;

-- Add service schedule column for maintenance agreements
ALTER TABLE security_contracts ADD COLUMN IF NOT EXISTS service_schedule text;

-- Add billing frequency override column
ALTER TABLE security_contracts ADD COLUMN IF NOT EXISTS billing_frequency_override text;

-- Add cancellation notice days column
ALTER TABLE security_contracts ADD COLUMN IF NOT EXISTS cancellation_notice_days integer DEFAULT 30;

-- Backfill existing rows
UPDATE security_contracts
SET agreement_type = COALESCE(agreement_type, 'monitoring'),
    system_type = COALESCE(system_type, 'security'),
    billing_frequency_override = COALESCE(billing_frequency_override, 'monthly'),
    cancellation_notice_days = COALESCE(cancellation_notice_days, 30)
WHERE agreement_type IS NULL OR system_type IS NULL OR billing_frequency_override IS NULL OR cancellation_notice_days IS NULL;

-- Add CHECK constraint for agreement_type (drop first for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'security_contracts_agreement_type_check'
  ) THEN
    ALTER TABLE security_contracts ADD CONSTRAINT security_contracts_agreement_type_check
      CHECK (agreement_type IN ('monitoring', 'maintenance', 'equipment_warranty'));
  END IF;
END $$;

-- Add CHECK constraint for system_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'security_contracts_system_type_check'
  ) THEN
    ALTER TABLE security_contracts ADD CONSTRAINT security_contracts_system_type_check
      CHECK (system_type IN ('security', 'surveillance', 'access_control', 'audio_video', 'automation', 'networking', 'lighting_control', 'other'));
  END IF;
END $$;

-- Add CHECK constraint for billing_frequency_override
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'security_contracts_billing_freq_override_check'
  ) THEN
    ALTER TABLE security_contracts ADD CONSTRAINT security_contracts_billing_freq_override_check
      CHECK (billing_frequency_override IS NULL OR billing_frequency_override IN ('monthly', 'yearly'));
  END IF;
END $$;

-- Add CHECK constraint for service_schedule
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'security_contracts_service_schedule_check'
  ) THEN
    ALTER TABLE security_contracts ADD CONSTRAINT security_contracts_service_schedule_check
      CHECK (service_schedule IS NULL OR service_schedule IN ('quarterly', 'semi_annual', 'annual'));
  END IF;
END $$;

-- Add index for filtering by agreement_type
CREATE INDEX IF NOT EXISTS idx_security_contracts_agreement_type
  ON security_contracts(agreement_type);

-- Add index for filtering by system_type
CREATE INDEX IF NOT EXISTS idx_security_contracts_system_type
  ON security_contracts(system_type);
