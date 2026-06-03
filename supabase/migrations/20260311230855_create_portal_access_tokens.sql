/*
  # Create Portal Access Tokens

  ## Summary
  Replaces Supabase magic links (which expire in 1 hour and are single-use) with
  a custom 30-day reusable token system for customer portal login.

  ## New Tables
  - `portal_access_tokens`
    - `id` (uuid, primary key)
    - `token` (text, unique) - cryptographically secure random token (hex string)
    - `contact_id` (uuid, FK to contacts) - which customer this token belongs to
    - `created_at` (timestamptz)
    - `expires_at` (timestamptz) - 30 days after creation
    - `invalidated_at` (timestamptz) - set when a new token is requested (old one is invalidated)
    - `last_used_at` (timestamptz) - tracks when the link was last clicked
    - `use_count` (int) - how many times the link has been used

  ## Security
  - RLS enabled
  - Only service role can insert/update (edge functions use service role)
  - No direct client access to token values
*/

CREATE TABLE IF NOT EXISTS portal_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  invalidated_at timestamptz DEFAULT NULL,
  last_used_at timestamptz DEFAULT NULL,
  use_count int DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_portal_access_tokens_token ON portal_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_portal_access_tokens_contact_id ON portal_access_tokens(contact_id);
CREATE INDEX IF NOT EXISTS idx_portal_access_tokens_expires_at ON portal_access_tokens(expires_at);

ALTER TABLE portal_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only insert portal access tokens"
  ON portal_access_tokens FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role only update portal access tokens"
  ON portal_access_tokens FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role only select portal access tokens"
  ON portal_access_tokens FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role only delete portal access tokens"
  ON portal_access_tokens FOR DELETE
  TO service_role
  USING (true);
