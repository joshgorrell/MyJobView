/*
  # Add Sales Dashboard Date Range Preference

  1. Changes
    - Add `sales_dashboard_date_range` column to profiles table
    - Default value is 'monthly' (current month)
    - Other options: 'last_30', 'last_60', 'last_90', 'quarterly', 'yearly', 'ytd', 'all_time'

  2. Security
    - No RLS changes needed (inherits from profiles table)
*/

-- Add sales_dashboard_date_range to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS sales_dashboard_date_range text DEFAULT 'monthly'
CHECK (sales_dashboard_date_range IN ('monthly', 'last_30', 'last_60', 'last_90', 'quarterly', 'yearly', 'ytd', 'all_time'));

-- Add helpful comment
COMMENT ON COLUMN profiles.sales_dashboard_date_range IS 'User preferred date range for sales dashboard: monthly, last_30, last_60, last_90, quarterly, yearly, ytd, all_time';
