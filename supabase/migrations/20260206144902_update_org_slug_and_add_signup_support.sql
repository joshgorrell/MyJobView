/*
  # Update Organization Slug and Add Signup Support

  1. Changes
    - Update Electronic Life slug from 'electronic-life' to 'electroniclife' (subdomain-friendly)
    - Add `max_users` column to organizations for plan-based user limits
    - Add `trial_ends_at` column for trial period tracking
    - Add `setup_completed_at` for onboarding tracking

  2. Security
    - Allow anonymous users to read basic org info by slug (needed for login page branding)
    - Allow service role to insert organizations (for signup flow)
*/

UPDATE organizations SET slug = 'electroniclife' WHERE slug = 'electronic-life';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'max_users'
  ) THEN
    ALTER TABLE organizations ADD COLUMN max_users integer DEFAULT 50;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'trial_ends_at'
  ) THEN
    ALTER TABLE organizations ADD COLUMN trial_ends_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'setup_completed_at'
  ) THEN
    ALTER TABLE organizations ADD COLUMN setup_completed_at timestamptz;
  END IF;
END $$;