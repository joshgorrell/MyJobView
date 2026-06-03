/*
  # Add Enable Public VIP Signup Setting

  ## Summary
  Adds a company-wide setting to control whether anonymous users can sign up for VIP memberships on their own.
  This allows admins to launch only the 90-Day Test and Tune program (via punchlist invites) without 
  allowing public self-signup for paid VIP memberships.

  ## Changes
  1. Add `enable_public_vip_signup` boolean column to company_settings
     - Default: false (disabled by default)
     - Controls visibility of the public VIP signup page

  ## Usage
  - When false: Public VIP signup page shows "Coming Soon" message
  - When true: Public VIP signup page allows customers to choose plans and sign up
  - Punchlist invites work regardless of this setting
  - Portal VIP management for existing members works regardless of this setting

  ## Security
  - No RLS changes needed
  - Inherits existing company_settings policies
*/

-- Add enable_public_vip_signup column to company_settings
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS enable_public_vip_signup boolean DEFAULT false;

-- Update existing company_settings records to false (disabled by default)
UPDATE company_settings
SET enable_public_vip_signup = false
WHERE enable_public_vip_signup IS NULL;
