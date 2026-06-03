/*
  # Add Monthly Sales Target to Profiles
  
  1. Changes
    - Add `monthly_sales_target` column to profiles table
    - Allows admins to set monthly sales targets for individual sales reps
    - Nullable - if not set, Monthly Target card will be hidden on Sales Dashboard
  
  2. Notes
    - Target is in decimal/numeric format to support currency values
    - Default is NULL (no target set)
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'monthly_sales_target'
  ) THEN
    ALTER TABLE profiles ADD COLUMN monthly_sales_target numeric(15, 2);
  END IF;
END $$;