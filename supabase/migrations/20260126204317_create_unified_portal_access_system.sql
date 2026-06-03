/*
  # Unified Portal Access Control System

  ## Overview
  Creates a comprehensive system to determine customer portal access levels and manage
  email notifications for proposals. This migration consolidates portal access logic
  into a single source of truth.

  ## Changes

  1. Portal Access Functions
     - `get_contact_portal_access_level(contact_id)` - Returns access level for a contact
     - Returns: 'full_portal', 'proposal_only', or 'no_access'
     - Checks VIP subscriptions, Test & Tune access, and active proposals
  
  2. Email Notification Control
     - Add `suppress_po_notification` to proposals (default: false)
     - Add `suppress_deposit_notification` to proposals (default: false)
     - Add `last_portal_access` to contacts
     - Add `portal_access_level_cache` to contacts for performance
  
  3. Portal Access Tracking
     - Add `portal_views` table to track customer portal activity
     - Track proposal views, payment attempts, and navigation
  
  4. Security
     - RLS policies for portal_views table
     - Only authenticated users can access their own portal activity
*/

-- Add email notification control columns to proposals
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS suppress_po_notification boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS suppress_deposit_notification boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS po_notification_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS deposit_notification_sent_at timestamptz;

-- Add portal access tracking to contacts
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS last_portal_access timestamptz,
ADD COLUMN IF NOT EXISTS portal_access_level_cache text,
ADD COLUMN IF NOT EXISTS portal_access_cache_updated_at timestamptz;

-- Create portal views tracking table
CREATE TABLE IF NOT EXISTS portal_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  view_type text NOT NULL CHECK (view_type IN ('dashboard', 'proposal_list', 'proposal_detail', 'invoice_list', 'invoice_detail', 'project_list', 'project_detail', 'appointment_list', 'vip_services', 'punchlist', 'vip_signup')),
  entity_id uuid,
  view_duration_seconds integer,
  device_type text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_views_contact ON portal_views(contact_id);
CREATE INDEX IF NOT EXISTS idx_portal_views_type ON portal_views(view_type);
CREATE INDEX IF NOT EXISTS idx_portal_views_created ON portal_views(created_at DESC);

-- Enable RLS on portal_views
ALTER TABLE portal_views ENABLE ROW LEVEL SECURITY;

-- Portal views policies - customers can only see their own activity
CREATE POLICY "Customers can view own portal activity"
  ON portal_views FOR SELECT
  USING (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Customers can insert own portal views"
  ON portal_views FOR INSERT
  WITH CHECK (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid()
    )
  );

-- All authenticated users (admins, sales) can view all portal activity
CREATE POLICY "Internal users can view all portal activity"
  ON portal_views FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'sales', 'sales_manager', 'finance', 'service_manager')
    )
  );

-- Function to get contact portal access level
CREATE OR REPLACE FUNCTION public.get_contact_portal_access_level(p_contact_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access_level text := 'no_access';
  v_has_vip boolean := false;
  v_has_test_tune boolean := false;
  v_has_active_proposal boolean := false;
BEGIN
  -- Check for active VIP subscription (active or trial)
  SELECT EXISTS (
    SELECT 1 FROM recurring_subscriptions
    WHERE contact_id = p_contact_id
    AND status IN ('active', 'trial')
    AND punchlist_enabled = true
    LIMIT 1
  ) INTO v_has_vip;
  
  IF v_has_vip THEN
    RETURN 'full_portal';
  END IF;
  
  -- Check for active Test & Tune access
  SELECT EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = p_contact_id
    AND access_type = 'test_and_tune'
    AND status = 'active'
    AND expiration_date >= CURRENT_DATE
    LIMIT 1
  ) INTO v_has_test_tune;
  
  IF v_has_test_tune THEN
    RETURN 'full_portal';
  END IF;
  
  -- Check for active proposals (sent or viewed, not expired)
  SELECT EXISTS (
    SELECT 1 FROM proposals
    WHERE contact_id = p_contact_id
    AND status IN ('sent', 'viewed')
    AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1
  ) INTO v_has_active_proposal;
  
  IF v_has_active_proposal THEN
    RETURN 'proposal_only';
  END IF;
  
  RETURN 'no_access';
END;
$$;

-- Function to refresh portal access cache for a contact
CREATE OR REPLACE FUNCTION public.refresh_contact_portal_access_cache(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access_level text;
BEGIN
  v_access_level := get_contact_portal_access_level(p_contact_id);
  
  UPDATE contacts
  SET 
    portal_access_level_cache = v_access_level,
    portal_access_cache_updated_at = now()
  WHERE id = p_contact_id;
END;
$$;

-- Function to update last portal access time
CREATE OR REPLACE FUNCTION public.update_contact_portal_access(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE contacts
  SET last_portal_access = now()
  WHERE id = p_contact_id;
END;
$$;

-- Trigger to refresh portal access cache when subscriptions change
CREATE OR REPLACE FUNCTION public.refresh_portal_access_on_subscription_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_contact_portal_access_cache(OLD.contact_id);
    RETURN OLD;
  ELSE
    PERFORM refresh_contact_portal_access_cache(NEW.contact_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trigger_refresh_portal_access_on_subscription ON recurring_subscriptions;
CREATE TRIGGER trigger_refresh_portal_access_on_subscription
  AFTER INSERT OR UPDATE OR DELETE ON recurring_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION refresh_portal_access_on_subscription_change();

-- Trigger to refresh portal access cache when access grants change
DROP TRIGGER IF EXISTS trigger_refresh_portal_access_on_grant ON punchlist_access_grants;
CREATE TRIGGER trigger_refresh_portal_access_on_grant
  AFTER INSERT OR UPDATE OR DELETE ON punchlist_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION refresh_portal_access_on_subscription_change();

-- Trigger to refresh portal access cache when proposals change
CREATE OR REPLACE FUNCTION public.refresh_portal_access_on_proposal_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_contact_portal_access_cache(OLD.contact_id);
    RETURN OLD;
  ELSE
    PERFORM refresh_contact_portal_access_cache(NEW.contact_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trigger_refresh_portal_access_on_proposal ON proposals;
CREATE TRIGGER trigger_refresh_portal_access_on_proposal
  AFTER INSERT OR UPDATE OF status, expires_at ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION refresh_portal_access_on_proposal_change();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_portal_access_cache ON contacts(portal_access_level_cache);
CREATE INDEX IF NOT EXISTS idx_contacts_last_portal_access ON contacts(last_portal_access DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_suppress_notifications ON proposals(suppress_po_notification, suppress_deposit_notification);

COMMENT ON FUNCTION get_contact_portal_access_level IS 'Determines portal access level for a contact: full_portal, proposal_only, or no_access';
COMMENT ON FUNCTION refresh_contact_portal_access_cache IS 'Updates the cached portal access level for a contact';
COMMENT ON FUNCTION update_contact_portal_access IS 'Updates the last portal access timestamp for a contact';
COMMENT ON TABLE portal_views IS 'Tracks customer portal activity for engagement analysis';
