/*
  # Fix Kiosk Anonymous Leads Submission

  1. Changes
    - Add RLS policy to allow anonymous users to create fishbowl leads
    - This enables the tradeshow kiosk to work without requiring authentication

  2. Security
    - Only allows creating leads when is_fishbowl = true
    - Maintains security for other lead creation scenarios
*/

-- Drop existing insert policy if needed to recreate with proper permissions
DROP POLICY IF EXISTS "Anonymous users can create fishbowl leads" ON public.leads;

-- Allow anonymous users to create fishbowl leads (for tradeshow kiosk)
CREATE POLICY "Anonymous users can create fishbowl leads"
  ON public.leads
  FOR INSERT
  TO anon
  WITH CHECK (is_fishbowl = true);
