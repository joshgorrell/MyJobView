/*
  # Create Company Settings Table

  1. New Table
    - `company_settings` - Stores all company-wide configuration settings
      - Core company info (name, logo, website, portal URL)
      - Email settings (from_email, from_name, reply_to_email)
      - Integration API keys (Google Maps, Twilio, OpenAI, Gemini, ZipTax)
      - Portal visibility toggles for customer-facing features
      - Payment settings (credit card convenience fees)
      - Time clock and auto-completion settings
      - Proposal defaults and pricing controls
      - Rewards and points system settings
      - QuickBooks integration settings

  2. Seeding
    - Insert one default row with sensible defaults

  3. Security
    - Enable RLS
    - Allow all authenticated users to SELECT (read settings)
    - Allow only admin users to UPDATE/INSERT settings
*/

-- Create the company_settings table
CREATE TABLE IF NOT EXISTS company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,

  -- Core Company Information
  company_name text NOT NULL DEFAULT 'My Company',
  company_logo_url text,
  website text,
  portal_url text,
  company_email text,
  primary_contact_email text,

  -- Email Settings (Resend)
  from_email text,
  from_name text,
  reply_to_email text,

  -- Integration API Keys
  google_maps_api_key text,
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_phone_number text,
  on_my_way_sms_template text DEFAULT 'Hi {customer_name}, this is {tech_name}. I''m on my way to your location for work order {job_number}. I should arrive soon. Thank you!',
  gemini_api_key text,
  openai_api_key text,
  zip_tax_api_key text,

  -- QuickBooks Integration
  qbo_realm_id text,

  -- Credit Card Convenience Fee Settings
  cc_convenience_fee_enabled boolean DEFAULT false,
  cc_convenience_fee_type text DEFAULT 'percentage' CHECK (cc_convenience_fee_type IN ('percentage', 'flat')),
  cc_convenience_fee_percentage numeric(5,4) DEFAULT 0.03,
  cc_convenience_fee_flat_amount numeric(10,2) DEFAULT 3.00,
  cc_convenience_fee_label text DEFAULT 'Credit Card Convenience Fee',

  -- Customer Portal Visibility Controls
  portal_proposals_enabled boolean DEFAULT true,
  portal_projects_enabled boolean DEFAULT false,
  portal_appointments_enabled boolean DEFAULT false,
  portal_invoices_enabled boolean DEFAULT false,
  portal_messages_enabled boolean DEFAULT false,
  portal_vip_services_enabled boolean DEFAULT false,
  portal_punchlist_enabled boolean DEFAULT true,
  enable_public_vip_signup boolean DEFAULT false,

  -- Project Task Auto-Completion Settings
  auto_completion_enabled boolean DEFAULT true,
  auto_completion_requires_approval boolean DEFAULT false,
  auto_completion_reopen_on_delete boolean DEFAULT true,

  -- Time Clock Settings
  auto_clock_out_enabled boolean DEFAULT false,
  forgot_clock_out_penalty_points integer DEFAULT 0,
  auto_clock_out_cutoff_time time DEFAULT '23:59:59',
  business_day_end_time time DEFAULT '17:00:00',
  auto_clock_out_schedule_enabled boolean DEFAULT false,
  last_auto_clock_out_run timestamptz,
  timezone text DEFAULT 'America/Chicago',
  home_clock_notification_enabled boolean DEFAULT false,
  home_location_radius_meters integer DEFAULT 150,
  home_clock_notification_roles text[] DEFAULT ARRAY['admin']::text[],
  require_gps_for_clock_in boolean DEFAULT false,
  require_gps_for_clock_out boolean DEFAULT false,

  -- Rewards and Points System
  photo_upload_points integer DEFAULT 10,

  -- Proposal Default Settings
  default_deposit_percent numeric(5,2) DEFAULT 50.00,
  default_project_mgmt_percent numeric(5,2) DEFAULT 0.00,
  default_system_design_percent numeric(5,2) DEFAULT 0.00,
  default_cc_fee_percent numeric(5,2) DEFAULT 0.00,
  default_misc_parts_percent numeric(5,2) DEFAULT 0.00,

  -- Product and Pricing Settings
  global_minimum_margin numeric(5,2) DEFAULT 0.00,
  enforce_minimum_pricing boolean DEFAULT false,
  labor_rate_per_hour numeric(10,2) DEFAULT 100.00,
  default_labor_rate numeric(10,2) DEFAULT 100.00,

  -- Job Module Settings (legacy)
  job_module_enabled boolean DEFAULT false,
  job_module_settings jsonb DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on organization_id for performance
CREATE INDEX IF NOT EXISTS idx_company_settings_organization_id ON company_settings(organization_id);

-- Seed initial company settings row
-- Note: This will only insert if the table is empty
INSERT INTO company_settings (
  company_name,
  portal_proposals_enabled,
  portal_punchlist_enabled,
  auto_completion_enabled,
  cc_convenience_fee_percentage,
  cc_convenience_fee_flat_amount,
  default_deposit_percent,
  labor_rate_per_hour,
  default_labor_rate,
  photo_upload_points
)
SELECT
  'My Company',
  true,
  true,
  true,
  0.03,
  3.00,
  50.00,
  100.00,
  100.00,
  10
WHERE NOT EXISTS (SELECT 1 FROM company_settings);

-- Enable Row Level Security
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read company settings
CREATE POLICY "All authenticated users can read company settings"
  ON company_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow admin users to update company settings
CREATE POLICY "Admin users can update company settings"
  ON company_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Allow admin users to insert company settings
CREATE POLICY "Admin users can insert company settings"
  ON company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Grant necessary permissions
GRANT SELECT ON company_settings TO authenticated;
GRANT UPDATE, INSERT ON company_settings TO authenticated;