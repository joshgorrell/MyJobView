/*
  # Add Automated Review Follow-up Tracking

  ## Summary
  Adds the columns and settings needed to support the automated 14-day review
  follow-up system. The cron job will stamp these columns after sending so it
  never fires twice for the same record.

  ## Changes

  ### review_requests table
  - `follow_up_sent_at` (timestamptz, nullable) — set when the automated
    follow-up email/SMS is sent. NULL means not yet sent.
  - `auto_followup_enabled` (boolean, default true) — allows per-record opt-out.

  ### customer_satisfaction table
  - `follow_up_sent_at` (timestamptz, nullable) — same semantics as above.
  - `auto_followup_enabled` (boolean, default true) — same as above.

  ### company_settings table
  - `auto_review_followup_enabled` (boolean, default false) — master on/off
    switch for the automated follow-up system.
  - `auto_review_followup_days` (integer, default 14) — configurable delay in
    days before the follow-up fires.

  ## Security
  No new RLS policies needed — columns are appended to existing tables that
  already have appropriate policies in place.
*/

-- review_requests: follow-up tracking columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'review_requests' AND column_name = 'follow_up_sent_at'
  ) THEN
    ALTER TABLE review_requests ADD COLUMN follow_up_sent_at timestamptz DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'review_requests' AND column_name = 'auto_followup_enabled'
  ) THEN
    ALTER TABLE review_requests ADD COLUMN auto_followup_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- customer_satisfaction: follow-up tracking columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_satisfaction' AND column_name = 'follow_up_sent_at'
  ) THEN
    ALTER TABLE customer_satisfaction ADD COLUMN follow_up_sent_at timestamptz DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_satisfaction' AND column_name = 'auto_followup_enabled'
  ) THEN
    ALTER TABLE customer_satisfaction ADD COLUMN auto_followup_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- company_settings: master toggle + configurable delay
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'auto_review_followup_enabled'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN auto_review_followup_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'auto_review_followup_days'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN auto_review_followup_days integer NOT NULL DEFAULT 14;
  END IF;
END $$;

-- Performance indexes for the cron job query
CREATE INDEX IF NOT EXISTS idx_review_requests_followup_query
  ON review_requests (organization_id, follow_up_sent_at, review_completed, sent_at)
  WHERE follow_up_sent_at IS NULL AND review_completed = false;

CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_followup_query
  ON customer_satisfaction (organization_id, follow_up_sent_at, rating, sent_at)
  WHERE follow_up_sent_at IS NULL AND rating IS NULL;
