/*
  # Portal Version Snapshot System

  ## Summary
  Creates a dedicated portal version tracking system separate from the general edit-history
  proposal_versions table. Each time a proposal is published to the customer portal, a full
  snapshot is saved so reps can restore any previous portal version back to an editable state.

  ## Changes

  ### 1. New Column on proposals
  - `current_portal_version` (integer, default 0) - The portal version number currently live.
    Increments each time the proposal is submitted to the portal.

  ### 2. New Table: proposal_portal_versions
  - `id` (uuid, PK)
  - `proposal_id` (uuid, FK -> proposals, CASCADE)
  - `portal_version_number` (integer) - Sequential 1-based counter per proposal
  - `snapshot_data` (jsonb) - Full snapshot of proposal + rooms + line_items at submission time
  - `submitted_by` (uuid, FK -> auth.users)
  - `submitted_at` (timestamptz)
  - `title` (text) - Proposal title at time of submission
  - `total` (numeric) - Proposal grand total at time of submission
  - `notes` (text) - Optional rep note about this version
  - UNIQUE(proposal_id, portal_version_number)

  ### 3. New RPC: save_portal_version_snapshot(proposal_id_param)
  Captures current proposal state and inserts a new portal version row.
  Called when a proposal is submitted to the portal.

  ### 4. New RPC: restore_portal_version(portal_version_id_param)
  Reads a portal version snapshot and restores it back to the proposal, rooms, and line items.
  Sets is_portal_visible=false, is_locked=false so the rep can review before re-submitting.

  ## Security
  - RLS enabled on proposal_portal_versions
  - SELECT: authenticated users in same org
  - INSERT: authenticated users in same org
  - No UPDATE/DELETE — portal version history is immutable
*/

-- Add current_portal_version to proposals
ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS current_portal_version integer DEFAULT 0;

-- Create portal versions table
CREATE TABLE IF NOT EXISTS public.proposal_portal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  portal_version_number integer NOT NULL,
  snapshot_data jsonb NOT NULL,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz DEFAULT now(),
  title text,
  total numeric(10,2),
  notes text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  UNIQUE(proposal_id, portal_version_number)
);

CREATE INDEX IF NOT EXISTS idx_portal_versions_proposal ON public.proposal_portal_versions(proposal_id, portal_version_number DESC);
CREATE INDEX IF NOT EXISTS idx_portal_versions_org ON public.proposal_portal_versions(organization_id);

ALTER TABLE public.proposal_portal_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view portal versions"
  ON public.proposal_portal_versions FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org members can create portal versions"
  ON public.proposal_portal_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- ============================================================
-- RPC: save_portal_version_snapshot
-- ============================================================
CREATE OR REPLACE FUNCTION public.save_portal_version_snapshot(
  proposal_id_param uuid,
  notes_param text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_proposal proposals%ROWTYPE;
  v_next_version integer;
  v_snapshot jsonb;
  v_version_id uuid;
  v_org_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_proposal FROM public.proposals WHERE id = proposal_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Proposal not found');
  END IF;

  -- Determine org
  v_org_id := v_proposal.organization_id;

  -- Next portal version number
  SELECT COALESCE(MAX(portal_version_number), 0) + 1
  INTO v_next_version
  FROM public.proposal_portal_versions
  WHERE proposal_id = proposal_id_param;

  -- Build full snapshot
  SELECT jsonb_build_object(
    'proposal', row_to_json(p.*),
    'rooms', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'room', row_to_json(r.*),
          'line_items', (
            SELECT jsonb_agg(row_to_json(li.*) ORDER BY li.sort_order)
            FROM public.proposal_line_items li
            WHERE li.room_id = r.id
          )
        ) ORDER BY r.sort_order
      )
      FROM public.proposal_rooms r
      WHERE r.proposal_id = p.id
    )
  )
  INTO v_snapshot
  FROM public.proposals p
  WHERE p.id = proposal_id_param;

  -- Insert the portal version record
  INSERT INTO public.proposal_portal_versions (
    proposal_id,
    portal_version_number,
    snapshot_data,
    submitted_by,
    submitted_at,
    title,
    total,
    notes,
    organization_id
  ) VALUES (
    proposal_id_param,
    v_next_version,
    v_snapshot,
    v_user_id,
    now(),
    v_proposal.title,
    v_proposal.grand_total,
    notes_param,
    v_org_id
  )
  RETURNING id INTO v_version_id;

  -- Update current_portal_version on the proposal
  UPDATE public.proposals
  SET current_portal_version = v_next_version,
      updated_at = now()
  WHERE id = proposal_id_param;

  RETURN jsonb_build_object(
    'success', true,
    'version_id', v_version_id,
    'portal_version_number', v_next_version
  );
END;
$$;

-- ============================================================
-- RPC: restore_portal_version
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_portal_version(
  portal_version_id_param uuid
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_pv public.proposal_portal_versions%ROWTYPE;
  v_proposal_snap jsonb;
  v_rooms_snap jsonb;
  v_room jsonb;
  v_room_data jsonb;
  v_line_items jsonb;
  v_li jsonb;
  v_proposal_id uuid;
  v_new_room_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_pv FROM public.proposal_portal_versions WHERE id = portal_version_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Portal version not found');
  END IF;

  v_proposal_id := v_pv.proposal_id;
  v_proposal_snap := v_pv.snapshot_data -> 'proposal';
  v_rooms_snap := v_pv.snapshot_data -> 'rooms';

  -- Hide from portal and unlock so rep can review/edit
  UPDATE public.proposals SET
    title              = (v_proposal_snap ->> 'title'),
    status             = 'sent',
    is_portal_visible  = false,
    is_locked          = false,
    locked_at          = NULL,
    locked_by          = NULL,
    notes              = (v_proposal_snap ->> 'notes'),
    scope_of_work      = (v_proposal_snap ->> 'scope_of_work'),
    updated_at         = now()
  WHERE id = v_proposal_id;

  -- Delete existing rooms + line items (CASCADE deletes line_items)
  DELETE FROM public.proposal_rooms WHERE proposal_id = v_proposal_id;

  -- Re-insert rooms and line items from snapshot
  IF v_rooms_snap IS NOT NULL AND jsonb_array_length(v_rooms_snap) > 0 THEN
    FOR v_room IN SELECT * FROM jsonb_array_elements(v_rooms_snap)
    LOOP
      v_room_data := v_room -> 'room';
      v_line_items := v_room -> 'line_items';

      v_new_room_id := gen_random_uuid();

      INSERT INTO public.proposal_rooms (
        id, proposal_id, name, sort_order, created_at, updated_at
      ) VALUES (
        v_new_room_id,
        v_proposal_id,
        v_room_data ->> 'name',
        (v_room_data ->> 'sort_order')::integer,
        now(),
        now()
      );

      IF v_line_items IS NOT NULL AND jsonb_array_length(v_line_items) > 0 THEN
        FOR v_li IN SELECT * FROM jsonb_array_elements(v_line_items)
        LOOP
          INSERT INTO public.proposal_line_items (
            id,
            room_id,
            proposal_id,
            product_id,
            description,
            quantity,
            unit_price,
            line_total,
            sort_order,
            taxable,
            item_type,
            notes,
            install_notes,
            tech_notes,
            is_hidden,
            parent_line_item_id,
            labor_phase_id,
            created_at,
            updated_at
          ) VALUES (
            gen_random_uuid(),
            v_new_room_id,
            v_proposal_id,
            NULLIF(v_li ->> 'product_id', '')::uuid,
            v_li ->> 'description',
            (v_li ->> 'quantity')::numeric,
            (v_li ->> 'unit_price')::numeric,
            (v_li ->> 'line_total')::numeric,
            (v_li ->> 'sort_order')::integer,
            (v_li ->> 'taxable')::boolean,
            v_li ->> 'item_type',
            v_li ->> 'notes',
            v_li ->> 'install_notes',
            v_li ->> 'tech_notes',
            COALESCE((v_li ->> 'is_hidden')::boolean, false),
            NULL,
            NULLIF(v_li ->> 'labor_phase_id', '')::uuid,
            now(),
            now()
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Log in activity feed
  INSERT INTO public.activity_feed (
    user_id, activity_type, entity_type, entity_id, description
  ) VALUES (
    v_user_id,
    'portal_version_restored',
    'proposal',
    v_proposal_id,
    format('Restored portal version %s', v_pv.portal_version_number)
  );

  RETURN jsonb_build_object(
    'success', true,
    'proposal_id', v_proposal_id,
    'restored_version', v_pv.portal_version_number,
    'message', format('Portal version %s restored. Review and re-submit when ready.', v_pv.portal_version_number)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_portal_version_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_portal_version TO authenticated;
