/*
  # Add "Salary - No Time Clock Needed" Employment Type

  ## Changes
  - Add new employment type: 'salary_no_clock' 
  - This type is for salaried employees who do not need to use the time clock
  - Users with this employment type will:
    - Have requires_daily_clock set to false automatically
    - Not see the time clock button in the header
    - Not be required to clock in/out

  ## Security
  - No RLS changes needed
  - Only affects profiles table constraint
*/

-- Drop the existing constraint
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_employment_type_check;

-- Add the new constraint with the additional type
ALTER TABLE profiles 
ADD CONSTRAINT profiles_employment_type_check 
CHECK (employment_type IN ('hourly', 'job_time', 'salary', 'salary_no_clock'));

-- Add a comment explaining the types
COMMENT ON COLUMN profiles.employment_type IS 
'Employment type: hourly (paid by daily clock), job_time (paid by job clocks), salary (fixed pay with clock tracking), salary_no_clock (fixed pay without clock tracking)';
