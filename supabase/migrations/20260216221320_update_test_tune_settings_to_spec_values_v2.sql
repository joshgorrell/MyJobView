/*
  # Update Test & Tune Settings to Match Original Specification

  1. Updates
    - On Target Bonus: $500 → $150
    - Tier 1 (1-5 hours saved): 10% → 20%
    - Tier 2 (6-10 hours saved): 15% → 30%
    - Tier 3 (11+ hours saved): 20% → 35%
    - Labor Burden Rate: $65/hr → $75/hr

  2. Tier Structure per Spec
    - Tier 1: Over Budget → No bonus ($0)
    - Tier 2: On Target → Flat $150 bonus
    - Tier 3: 1-5 hours saved → 20% of labor savings
    - Tier 4: 6-10 hours saved → 30% of labor savings
    - Tier 5: 11+ hours saved → 35% of labor savings

  3. Notes
    - Labor Savings = (Hours Saved) × $75/hour
    - Bonus Split: 65% Lead Tech, 35% PM
    - Updates all existing settings records
*/

-- Update all existing test_tune_settings records to match spec
UPDATE test_tune_settings SET
  on_target_bonus_amount = 150.00,
  tier_1_percentage = 20.0,
  tier_2_percentage = 30.0,
  tier_3_percentage = 35.0,
  default_labor_burden_rate = 75.00,
  updated_at = now();

-- Update the default values in the table definition
ALTER TABLE test_tune_settings
  ALTER COLUMN on_target_bonus_amount SET DEFAULT 150.00,
  ALTER COLUMN tier_1_percentage SET DEFAULT 20.0,
  ALTER COLUMN tier_2_percentage SET DEFAULT 30.0,
  ALTER COLUMN tier_3_percentage SET DEFAULT 35.0,
  ALTER COLUMN default_labor_burden_rate SET DEFAULT 75.00;

-- Add detailed comments explaining tier structure
COMMENT ON TABLE test_tune_settings IS 'Test & Tune bonus settings per original specification:
Tier 1 (Over Budget): No bonus
Tier 2 (On Target): $150 flat bonus
Tier 3 (1-5 hours saved): 20% of labor savings
Tier 4 (6-10 hours saved): 30% of labor savings
Tier 5 (11+ hours saved): 35% of labor savings
Split: 65% Lead Tech, 35% PM
Labor Burden: $75/hour';

COMMENT ON COLUMN test_tune_settings.on_target_bonus_amount IS 'Tier 2: Flat bonus when exactly on target ($150 per spec)';
COMMENT ON COLUMN test_tune_settings.tier_1_percentage IS 'Tier 3: Percentage of savings for 1-5 hours saved (20% per spec)';
COMMENT ON COLUMN test_tune_settings.tier_2_percentage IS 'Tier 4: Percentage of savings for 6-10 hours saved (30% per spec)';
COMMENT ON COLUMN test_tune_settings.tier_3_percentage IS 'Tier 5: Percentage of savings for 11+ hours saved (35% per spec)';
COMMENT ON COLUMN test_tune_settings.default_labor_burden_rate IS 'Cost per labor hour for calculating savings ($75/hr per spec)';