/*
  # Add Default Tax Jurisdiction and Update Proposals

  1. Creates default tax jurisdiction with 9.35% rate
  2. Updates all proposals with 0% tax rate to use the default 9.35% rate
  3. Recalculates proposal totals for affected proposals

  ## Changes
  - Insert default tax jurisdiction (9.35% combined rate)
  - Update proposals table to set tax_rate = 0.0935 where currently 0
  - Trigger recalculation of proposal totals
*/

-- Insert default tax jurisdiction with 9.35% rate using first user as company_id
INSERT INTO tax_jurisdictions (
  company_id,
  jurisdiction_name,
  state,
  combined_rate,
  state_rate,
  county_rate,
  city_rate,
  special_rate,
  is_default,
  is_active,
  effective_date
)
SELECT 
  id,
  'Default Company Tax Rate (9.35%)',
  'TX',
  0.0935,
  0.0625,
  0.0200,
  0.0110,
  0.0000,
  true,
  true,
  CURRENT_DATE
FROM auth.users
LIMIT 1
ON CONFLICT DO NOTHING;

-- Update all proposals with 0% tax rate to use 9.35%
UPDATE proposals
SET tax_rate = 0.0935
WHERE tax_rate = 0 OR tax_rate IS NULL;

-- Recalculate totals for all affected proposals
DO $$
DECLARE
  proposal_record RECORD;
BEGIN
  FOR proposal_record IN 
    SELECT id FROM proposals WHERE tax_rate = 0.0935
  LOOP
    PERFORM calculate_proposal_totals(proposal_record.id);
  END LOOP;
END $$;
