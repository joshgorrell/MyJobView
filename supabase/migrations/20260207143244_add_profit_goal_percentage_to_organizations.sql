/*
  # Add Profit Goal Percentage to Organizations

  1. Changes
    - Add `profit_goal_percentage` column to `organizations` table
    - Default value is 40 (representing 40% profit margin goal)

  2. Purpose
    - Configurable profit margin goal for grading sales order profitability
    - Used in the Sales Order Stats tab to calculate project performance grades
    - Admin can adjust this value to set company-wide profitability targets

  3. Notes
    - Value stored as whole number percentage (e.g., 40 = 40%)
    - Used to calculate letter grades: A (exceeds goal), B (meets goal), C (below goal), etc.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'profit_goal_percentage'
  ) THEN
    ALTER TABLE organizations ADD COLUMN profit_goal_percentage numeric DEFAULT 40;
  END IF;
END $$;

COMMENT ON COLUMN organizations.profit_goal_percentage IS 'Target profit margin percentage for grading sales order profitability (e.g., 40 = 40%)';
