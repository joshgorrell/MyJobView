/*
# Add Dealer Subdomain Support

## Overview
Adds a `subdomain` column to the `organizations` table so each dealer can claim
their own subdomain (e.g., `el.myjobview.com`). Also creates a `subdomain_changes`
audit table to track renames so old links can be redirected to the new subdomain.

## New Columns
- `organizations.subdomain` (text, nullable, unique) — the dealer's chosen subdomain.
  Must be 3-30 chars, lowercase alphanumeric and hyphens only, must start/end with
  a letter or number. Hyphens are allowed in the middle (e.g., `acme-electric`).

## New Tables
- `subdomain_changes` — audit log of every subdomain rename.
  - `id` (uuid, primary key)
  - `organization_id` (uuid, FK to organizations)
  - `old_subdomain` (text, nullable — null if first claim)
  - `new_subdomain` (text, not null)
  - `changed_by` (uuid, FK to profiles — who made the change)
  - `changed_at` (timestamptz, default now())

## Security
- RLS enabled on `subdomain_changes`.
- Only authenticated users in the same organization can read the audit log.
- Only admins can insert (the app writes on behalf of admins).

## Reserved Subdomains
A check constraint blocks reserved names: www, api, admin, mail, app, portal,
support, help, staging, dev, test, myjobview, bolt, mjjv, mjv, auth, cdn,
ns1, ns2, ftp, smtp, pop, imap, webmail, dashboard, manage, panel, console,
billing, payments, status, assets, static, media, img, images, docs, blog,
shop, store, landing, home, secure, vpn, remote, git, ci, cd, build,
deploy, monitor, logs, analytics, tracking, tags, pixels, go, link,
redirect, sso, oauth, login, signup, register, account, settings,
config, internal, staff, employee, agent, bot, service, worker, cron,
queue, job, task, notification, alert, webhook, api-gateway, relay,
proxy, tunnel, edge, function, supabase, resend, stripe.

## Notes
1. The subdomain is nullable so existing organizations are unaffected until a
   dealer explicitly claims one.
2. The unique constraint ensures no two dealers can claim the same subdomain.
3. The check constraint enforces format validity (lowercase alphanumeric + hyphens,
   3-30 chars, must start/end with alphanumeric).
4. The reserved-words blocklist is enforced at the database level so even direct
   SQL inserts cannot bypass it.
*/

-- Add subdomain column to organizations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'subdomain'
  ) THEN
    ALTER TABLE organizations ADD COLUMN subdomain text;
  END IF;
END $$;

-- Unique constraint on subdomain (partial — only for non-null values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_subdomain_key'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_subdomain_key UNIQUE (subdomain);
  END IF;
END $$;

-- Check constraint for valid subdomain format
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_subdomain_format'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_subdomain_format
    CHECK (
      subdomain IS NULL
      OR (
        subdomain ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
        AND subdomain !~ '--'
      )
    );
  END IF;
END $$;

-- Check constraint blocking reserved subdomains
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_subdomain_not_reserved'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_subdomain_not_reserved
    CHECK (
      subdomain IS NULL
      OR lower(subdomain) NOT IN (
        'www', 'api', 'admin', 'mail', 'app', 'portal', 'support', 'help',
        'staging', 'dev', 'test', 'myjobview', 'bolt', 'mjjv', 'mjv', 'auth',
        'cdn', 'ns1', 'ns2', 'ftp', 'smtp', 'pop', 'imap', 'webmail',
        'dashboard', 'manage', 'panel', 'console', 'billing', 'payments',
        'status', 'assets', 'static', 'media', 'img', 'images', 'docs',
        'blog', 'shop', 'store', 'landing', 'home', 'secure', 'vpn',
        'remote', 'git', 'ci', 'cd', 'build', 'deploy', 'monitor', 'logs',
        'analytics', 'tracking', 'tags', 'pixels', 'go', 'link', 'redirect',
        'sso', 'oauth', 'login', 'signup', 'register', 'account',
        'settings', 'config', 'internal', 'staff', 'employee', 'agent',
        'bot', 'service', 'worker', 'cron', 'queue', 'job', 'task',
        'notification', 'alert', 'webhook', 'api-gateway', 'relay',
        'proxy', 'tunnel', 'edge', 'function', 'supabase', 'resend',
        'stripe', 'el', 'elc', 'electroniclife', 'electronic-life'
      )
    );
  END IF;
END $$;

-- Create subdomain_changes audit table
CREATE TABLE IF NOT EXISTS subdomain_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  old_subdomain text,
  new_subdomain text NOT NULL,
  changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at timestamptz DEFAULT now()
);

ALTER TABLE subdomain_changes ENABLE ROW LEVEL SECURITY;

-- Only authenticated users in the same org can read the audit log
DROP POLICY IF EXISTS "select_own_subdomain_changes" ON subdomain_changes;
CREATE POLICY "select_own_subdomain_changes"
  ON subdomain_changes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.organization_id = subdomain_changes.organization_id
    )
  );

-- Only admins can insert audit records (the app writes on their behalf)
DROP POLICY IF EXISTS "insert_own_subdomain_changes" ON subdomain_changes;
CREATE POLICY "insert_own_subdomain_changes"
  ON subdomain_changes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.organization_id = subdomain_changes.organization_id
      AND p.role = 'admin'
    )
  );

-- Index for fast subdomain lookups (used by the app on every page load)
CREATE INDEX IF NOT EXISTS idx_organizations_subdomain
  ON organizations (subdomain)
  WHERE subdomain IS NOT NULL;

-- Index for fast old-subdomain redirect lookups
CREATE INDEX IF NOT EXISTS idx_subdomain_changes_old_subdomain
  ON subdomain_changes (old_subdomain)
  WHERE old_subdomain IS NOT NULL;
