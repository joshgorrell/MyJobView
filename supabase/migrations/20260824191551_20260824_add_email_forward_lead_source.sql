/*
# Add Email Forward Lead Source and Inbound Email Tracking

## Purpose
Enables the system to receive forwarded lead emails at leads@electroniclife.com via Resend inbound webhooks.
AI extracts contact details from the email body, creates a lead in the Fishbowl, and flags it for rep verification.

## Changes

### 1. leads table — new lead_source value
- Adds 'email_forward' to the allowed lead_source CHECK constraint values.
- Existing values: manual, kiosk, website, referral, import, other
- New values: manual, kiosk, website, referral, import, other, email_forward

### 2. leads table — new columns
- `is_incomplete` (boolean, default false): Set to true when AI extracted data from a forwarded email that needs rep verification. Cleared when the rep saves the lead after reviewing.
- `raw_email_content` (text, nullable): Stores the original forwarded email body for rep reference.
- `raw_email_subject` (text, nullable): Stores the original forwarded email subject line.

### 3. company_settings table — new column
- `lead_forward_address` (text, nullable): The configured forwarding email address (e.g., leads@electroniclife.com). Editable by admins without a code deploy.

## Security
- No new tables created, so no new RLS policies needed.
- Existing RLS policies on leads and company_settings remain in effect.
- The edge function that processes inbound emails uses the service role key (server-side only), bypassing RLS intentionally for automated lead creation.

## Important Notes
1. The CHECK constraint is replaced (DROP + ADD) to include the new value. This is safe because it only adds a new allowed value — existing rows are unaffected.
2. All new columns are nullable or have safe defaults, so existing rows are unaffected.
3. The lead_forward_address column in company_settings has no default — admins set it via the settings UI.
*/

-- 1. Update lead_source CHECK constraint to include 'email_forward'
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_lead_source_check
  CHECK (lead_source IN ('manual', 'kiosk', 'website', 'referral', 'import', 'other', 'email_forward'));

-- 2. Add new columns to leads table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'is_incomplete'
  ) THEN
    ALTER TABLE leads ADD COLUMN is_incomplete boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'raw_email_content'
  ) THEN
    ALTER TABLE leads ADD COLUMN raw_email_content text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'raw_email_subject'
  ) THEN
    ALTER TABLE leads ADD COLUMN raw_email_subject text;
  END IF;
END $$;

-- 3. Add lead_forward_address column to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'lead_forward_address'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN lead_forward_address text;
  END IF;
END $$;

-- 4. Add index for filtering incomplete leads
CREATE INDEX IF NOT EXISTS idx_leads_is_incomplete ON leads (is_incomplete) WHERE is_incomplete = true;

-- 5. Add index for filtering by email_forward source
CREATE INDEX IF NOT EXISTS idx_leads_email_forward ON leads (lead_source) WHERE lead_source = 'email_forward';
