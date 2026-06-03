/*
  # Add Portal Module Visibility Controls

  1. Changes
    - Add boolean columns to `company_settings` to control which portal modules are visible to customers
    - Default all modules to true (visible) except for some that should be opt-in
    
  2. Portal Modules
    - portal_proposals_enabled: Show proposals section
    - portal_projects_enabled: Show projects section
    - portal_appointments_enabled: Show appointments/calendar section
    - portal_invoices_enabled: Show invoices section
    - portal_messages_enabled: Show messages section
    - portal_vip_services_enabled: Show VIP services section
    - portal_punchlist_enabled: Show punchlist/test & tune section
    
  3. Notes
    - Admins can toggle these in company settings to control portal visibility
    - Useful for phased rollout of portal features
*/

-- Add portal module visibility columns
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS portal_proposals_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS portal_projects_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS portal_appointments_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS portal_invoices_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS portal_messages_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS portal_vip_services_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS portal_punchlist_enabled boolean DEFAULT true;

-- Update existing company settings to enable proposals and punchlist by default
UPDATE company_settings
SET 
  portal_proposals_enabled = true,
  portal_punchlist_enabled = true,
  portal_projects_enabled = false,
  portal_appointments_enabled = false,
  portal_invoices_enabled = false,
  portal_messages_enabled = false,
  portal_vip_services_enabled = false
WHERE portal_proposals_enabled IS NULL;