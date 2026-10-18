/*
# Add Open Tracking and Follow-Up Columns to Feedback Email Tables

## Purpose
This migration adds the database columns needed for two features:
1. Email open tracking via tracking pixels (1x1 transparent GIF) for Google Review requests, Customer Satisfaction surveys, and Lost Opportunity review emails.
2. Automated follow-up support for Proposal Check emails and Lost Opportunity review emails, which were previously excluded from the automated follow-up job.

## Changes by Table

### review_requests (Google Review requests)
- Adds `open_token` (text) — unique token embedded in the tracking pixel URL so we can identify which email was opened.
- Adds `opened_at` (timestamptz) — timestamp of the first time the email open pixel was loaded.
- The existing `email_opened`, `link_clicked`, and `clicked_at` columns remain and will now be populated by the tracking endpoints.
- The existing `auto_followup_enabled` (default true) and `follow_up_sent_at` columns remain unchanged.

### customer_satisfaction (Customer Satisfaction / Lifecycle surveys)
- Adds `open_token` (text) — unique token for the tracking pixel.
- Adds `opened_at` (timestamptz) — timestamp of first email open detection.
- The existing `auto_followup_enabled` and `follow_up_sent_at` columns remain unchanged.

### lost_review_details (Lost Opportunity reviews)
- Adds `open_token` (text) — unique token for the email-open tracking pixel (separate from the existing `lost_review_tokens` table which handles response form access).
- Adds `email_opened_at` (timestamptz) — timestamp of first email open detection. Named `email_opened_at` to distinguish from the existing `opened_at` column which records when the response form was opened.
- Adds `auto_followup_enabled` (boolean, default true) — enables automated follow-up for lost opportunity emails.
- Adds `follow_up_sent_at` (timestamptz) — timestamp when the automated follow-up was sent, preventing duplicates.

### proposal_check_emails (Proposal Check emails)
- Adds `auto_followup_enabled` (boolean, default true) — enables automated follow-up for proposal check emails.
- Adds `follow_up_sent_at` (timestamptz) — timestamp when the automated follow-up was sent.
- The existing `open_token`, `opened_at`, and `last_opened_at` columns remain unchanged (open tracking already works for this table).

## Security
- No new tables created.
- No RLS policy changes — all existing policies remain in effect.
- All new columns are nullable (or have safe defaults) so existing rows are not affected.
- `open_token` values are generated at send time using crypto.randomUUID() and are not predictable.
*/

DO $$ BEGIN
  ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS open_token text;
  ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS opened_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE customer_satisfaction ADD COLUMN IF NOT EXISTS open_token text;
  ALTER TABLE customer_satisfaction ADD COLUMN IF NOT EXISTS opened_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE lost_review_details ADD COLUMN IF NOT EXISTS open_token text;
  ALTER TABLE lost_review_details ADD COLUMN IF NOT EXISTS email_opened_at timestamptz;
  ALTER TABLE lost_review_details ADD COLUMN IF NOT EXISTS auto_followup_enabled boolean NOT NULL DEFAULT true;
  ALTER TABLE lost_review_details ADD COLUMN IF NOT EXISTS follow_up_sent_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE proposal_check_emails ADD COLUMN IF NOT EXISTS auto_followup_enabled boolean NOT NULL DEFAULT true;
  ALTER TABLE proposal_check_emails ADD COLUMN IF NOT EXISTS follow_up_sent_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Indexes for fast token lookups (used by tracking pixel endpoints)
CREATE INDEX IF NOT EXISTS idx_review_requests_open_token ON review_requests (open_token) WHERE open_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_open_token ON customer_satisfaction (open_token) WHERE open_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lost_review_details_open_token ON lost_review_details (open_token) WHERE open_token IS NOT NULL;

-- Indexes for follow-up job queries (find emails needing follow-up)
CREATE INDEX IF NOT EXISTS idx_lost_review_details_followup ON lost_review_details (organization_id, auto_followup_enabled, follow_up_sent_at, delivery_status);
CREATE INDEX IF NOT EXISTS idx_proposal_check_emails_followup ON proposal_check_emails (organization_id, auto_followup_enabled, follow_up_sent_at, status);
