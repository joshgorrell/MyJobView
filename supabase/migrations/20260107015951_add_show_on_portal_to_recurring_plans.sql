/*
  # Add Portal Visibility Control to VIP Plans

  ## Summary
  Adds a `show_on_portal` column to the recurring_plans table to allow admins to control
  which VIP membership plans are displayed on the public portal membership page.

  ## Changes
  1. Add Column
    - `show_on_portal` (boolean, default true) - Controls whether plan is visible on public portal

  ## Notes
  - Existing plans will default to `show_on_portal = true` for backwards compatibility
  - Admins can now selectively show/hide plans on the portal while keeping them active internally
*/

-- Add show_on_portal column to recurring_plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_plans' AND column_name = 'show_on_portal'
  ) THEN
    ALTER TABLE recurring_plans ADD COLUMN show_on_portal boolean DEFAULT true;
  END IF;
END $$;