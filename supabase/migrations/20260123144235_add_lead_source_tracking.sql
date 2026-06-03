/*
  # Add Lead Source Tracking

  1. Changes
    - Add `lead_source` column to leads table
    - Possible values: 'manual', 'kiosk', 'website', 'referral', 'import', 'other'
    - Default to 'manual' for existing leads
    - Add index for better query performance

  2. Notes
    - This helps track where leads originated from
    - Especially useful for kiosk leads which don't have a created_by user
    - Can be used for analytics and reporting
*/

-- Add lead_source column
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS lead_source text DEFAULT 'manual' 
CHECK (lead_source IN ('manual', 'kiosk', 'website', 'referral', 'import', 'other'));

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_leads_lead_source ON leads(lead_source);

-- Add comment for documentation
COMMENT ON COLUMN leads.lead_source IS 'Source of the lead: manual (staff created), kiosk (tradeshow), website (form), referral, import, or other';
