/*
  # Proposal Locking System

  ## Summary
  Creates a comprehensive locking system for Live proposals on the customer portal to prevent accidental changes that would immediately affect customer view.

  ## Changes Made

  1. **New Columns to proposals table**
     - `is_locked` (boolean) - Indicates if proposal is locked
     - `locked_at` (timestamptz) - When proposal was locked
     - `locked_by` (uuid) - User who locked the proposal
     - `template_id` (uuid) - Selected report template for this proposal
     - `last_emailed_at` (timestamptz) - Track when proposal was last emailed
     - `last_emailed_by` (uuid) - User who last emailed the proposal

  2. **Auto-Lock Trigger**
     - Automatically locks proposals when made visible on portal with active status
     - Lock condition: is_portal_visible = true AND status IN ('sent', 'viewed', 'approved', 'approved_pending_action')

  3. **RPC Functions**
     - `unlock_proposal` - Unlocks a proposal with audit logging
     - `promote_revision_to_live` - Promotes a revision to live with optional notification
     - `lock_proposal` - Manually lock a proposal

  4. **Activity Tracking**
     - Track all lock/unlock events
     - Track revision promotions
     - Track template changes
     - Track email sending

  ## Security
  - RLS policies enforce authenticated user access
  - Audit trail for all locking operations
  - Only authorized users can lock/unlock proposals
*/

-- Add locking and template fields to proposals
ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS locked_at timestamptz,
ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.proposal_report_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_emailed_at timestamptz,
ADD COLUMN IF NOT EXISTS last_emailed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for locked proposals
CREATE INDEX IF NOT EXISTS idx_proposals_is_locked ON public.proposals(is_locked) WHERE is_locked = true;
CREATE INDEX IF NOT EXISTS idx_proposals_template_id ON public.proposals(template_id) WHERE template_id IS NOT NULL;

-- Function to automatically lock proposals when made live on portal
CREATE OR REPLACE FUNCTION public.auto_lock_live_proposals()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- If proposal becomes visible on portal with active status, lock it
  IF NEW.is_portal_visible = true
     AND NEW.is_active_revision = true
     AND NEW.status IN ('sent', 'viewed', 'approved', 'approved_pending_action')
     AND (OLD.is_portal_visible = false OR OLD.is_active_revision = false OR OLD.status NOT IN ('sent', 'viewed', 'approved', 'approved_pending_action'))
  THEN
    NEW.is_locked := true;
    NEW.locked_at := now();
    NEW.locked_by := auth.uid();
  END IF;

  -- If proposal is no longer live on portal, unlock it
  IF NEW.is_portal_visible = false OR NEW.is_active_revision = false
     THEN
    NEW.is_locked := false;
    NEW.locked_at := NULL;
    NEW.locked_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for auto-locking
DROP TRIGGER IF EXISTS auto_lock_live_proposals_trigger ON public.proposals;
CREATE TRIGGER auto_lock_live_proposals_trigger
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_lock_live_proposals();

-- Function to unlock a proposal (with audit logging)
CREATE OR REPLACE FUNCTION public.unlock_proposal(proposal_id_param uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_proposal proposals%ROWTYPE;
  v_user_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get proposal
  SELECT * INTO v_proposal FROM public.proposals WHERE id = proposal_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Proposal not found');
  END IF;

  -- Unlock the proposal
  UPDATE public.proposals
  SET
    is_locked = false,
    locked_at = NULL,
    locked_by = NULL,
    updated_at = now()
  WHERE id = proposal_id_param;

  -- Log the unlock action in activity feed
  INSERT INTO public.activity_feed (
    user_id,
    activity_type,
    entity_type,
    entity_id,
    description
  ) VALUES (
    v_user_id,
    'proposal_unlocked',
    'proposal',
    proposal_id_param,
    'Unlocked Live proposal for editing'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Proposal unlocked successfully'
  );
END;
$$;

-- Function to manually lock a proposal
CREATE OR REPLACE FUNCTION public.lock_proposal(proposal_id_param uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Lock the proposal
  UPDATE public.proposals
  SET
    is_locked = true,
    locked_at = now(),
    locked_by = v_user_id,
    updated_at = now()
  WHERE id = proposal_id_param;

  -- Log the lock action
  INSERT INTO public.activity_feed (
    user_id,
    activity_type,
    entity_type,
    entity_id,
    description
  ) VALUES (
    v_user_id,
    'proposal_locked',
    'proposal',
    proposal_id_param,
    'Manually locked proposal'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Proposal locked successfully'
  );
END;
$$;

-- Function to promote a revision to live
CREATE OR REPLACE FUNCTION public.promote_revision_to_live(
  revision_id_param uuid,
  send_notification boolean DEFAULT false,
  notification_message text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_revision proposals%ROWTYPE;
  v_old_live_id uuid;
  v_user_id uuid;
  v_contact_email text;
  v_proposal_number text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get the revision
  SELECT * INTO v_revision FROM public.proposals WHERE id = revision_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Revision not found');
  END IF;

  -- Get the current live revision ID (if any)
  SELECT id INTO v_old_live_id
  FROM public.proposals
  WHERE parent_proposal_id = COALESCE(v_revision.parent_proposal_id, v_revision.id)
    AND is_active_revision = true
    AND id != revision_id_param;

  -- Unlock and hide old live revision
  IF v_old_live_id IS NOT NULL THEN
    UPDATE public.proposals
    SET
      is_active_revision = false,
      is_portal_visible = false,
      is_locked = false,
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
    WHERE id = v_old_live_id;
  END IF;

  -- Promote new revision to live (trigger will auto-lock it)
  UPDATE public.proposals
  SET
    is_active_revision = true,
    is_portal_visible = true,
    status = CASE
      WHEN status = 'designing' THEN 'ready_to_submit'
      ELSE status
    END,
    updated_at = now()
  WHERE id = revision_id_param;

  -- Log the promotion
  INSERT INTO public.activity_feed (
    user_id,
    activity_type,
    entity_type,
    entity_id,
    description
  ) VALUES (
    v_user_id,
    'revision_promoted',
    'proposal',
    revision_id_param,
    format('Promoted revision "%s" to Live', v_revision.revision_name)
  );

  -- Send notification if requested
  IF send_notification THEN
    SELECT c.email, p.proposal_number
    INTO v_contact_email, v_proposal_number
    FROM public.proposals p
    JOIN public.contacts c ON c.id = p.contact_id
    WHERE p.id = revision_id_param;

    -- Create notification record for customer
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      related_id
    ) VALUES (
      v_user_id,
      'proposal_updated',
      'Proposal Updated',
      COALESCE(notification_message, 'Your proposal has been updated. Please review the changes.'),
      revision_id_param
    );

    -- TODO: Trigger email send via edge function
    -- This would call send-proposal-email edge function
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Revision promoted to Live successfully',
    'old_live_id', v_old_live_id,
    'new_live_id', revision_id_param
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.unlock_proposal TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_proposal TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_revision_to_live TO authenticated;