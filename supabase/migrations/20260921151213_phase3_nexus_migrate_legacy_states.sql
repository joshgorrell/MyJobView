/*
# Nexus Source of Truth Migration

## Purpose
Migrates any legacy `company_settings.nexus_states` values that do not have
corresponding current `dealer_nexus_states` records. This ensures no dealer
loses existing nexus configuration when we switch the frontend to read from
`dealer_nexus_states` exclusively.

## Changes
1. For each organization, unnest `company_settings.nexus_states` into individual
   state codes.
2. For each state code that does NOT already have a current `dealer_nexus_states`
   record for that organization, insert one with:
   - nexus_status = 'yes' (legacy array represented collecting states)
   - source = 'migrated_legacy'
   - is_current = true
   - effective_from = 2026-09-10 (matching the original migration date)
3. Existing `dealer_nexus_states` records are NOT modified.

## Verification
After migration, every state in every org's `company_settings.nexus_states`
array has a corresponding current `dealer_nexus_states` record.

## Safety
- `company_settings.nexus_states` column is NOT dropped or modified.
- No existing `dealer_nexus_states` rows are modified.
- This migration is idempotent — re-running it will not create duplicates.
*/

INSERT INTO dealer_nexus_states (
  organization_id,
  state,
  nexus_status,
  source,
  is_current,
  effective_from,
  created_at,
  updated_at
)
SELECT
  cs.organization_id,
  state_code,
  'yes',
  'migrated_legacy',
  true,
  '2026-09-10'::date,
  now(),
  now()
FROM company_settings cs
CROSS JOIN LATERAL unnest(cs.nexus_states) AS state_code
WHERE NOT EXISTS (
  SELECT 1 FROM dealer_nexus_states dns
  WHERE dns.organization_id = cs.organization_id
    AND dns.state = state_code
    AND dns.is_current = true
);
