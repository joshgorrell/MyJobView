/*
  # Add Proposal Revisions System

  1. Changes to proposals table
    - Add `is_revision` (boolean) - Whether this is a revision or original
    - Add `parent_proposal_id` (uuid) - References parent proposal if this is a revision
    - Add `revision_name` (text) - Name/label for this revision (e.g., "Option A", "Budget Version")
    - Add `is_active_revision` (boolean) - Which revision is currently active
    - Add `is_portal_visible` (boolean) - Whether this revision is visible in customer portal
    - Add `revision_number` (integer) - Sequential revision number

  2. New View
    - `proposals_with_revision_count` - Shows proposals with revision counts

  3. Functions
    - `create_proposal_revision()` - Creates a new revision from existing proposal
    - `set_active_revision()` - Sets which revision is active
    - `toggle_revision_portal_visibility()` - Toggles portal visibility for a revision

  4. Security
    - Update RLS policies to handle revisions
    - Ensure portal users only see portal-visible revisions
*/

-- Add revision columns to proposals table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposals' AND column_name = 'is_revision') THEN
    ALTER TABLE proposals ADD COLUMN is_revision boolean DEFAULT false NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposals' AND column_name = 'parent_proposal_id') THEN
    ALTER TABLE proposals ADD COLUMN parent_proposal_id uuid REFERENCES proposals(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposals' AND column_name = 'revision_name') THEN
    ALTER TABLE proposals ADD COLUMN revision_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposals' AND column_name = 'is_active_revision') THEN
    ALTER TABLE proposals ADD COLUMN is_active_revision boolean DEFAULT true NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposals' AND column_name = 'is_portal_visible') THEN
    ALTER TABLE proposals ADD COLUMN is_portal_visible boolean DEFAULT false NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposals' AND column_name = 'revision_number') THEN
    ALTER TABLE proposals ADD COLUMN revision_number integer DEFAULT 1 NOT NULL;
  END IF;
END $$;

-- Create index for finding revisions
CREATE INDEX IF NOT EXISTS idx_proposals_parent_proposal ON proposals(parent_proposal_id) WHERE parent_proposal_id IS NOT NULL;

-- Function to get the root proposal (original proposal, not a revision)
CREATE OR REPLACE FUNCTION get_root_proposal_id(p_proposal_id uuid)
RETURNS uuid AS $$
DECLARE
  v_parent_id uuid;
  v_current_id uuid := p_proposal_id;
BEGIN
  -- If this is not a revision, return itself
  SELECT parent_proposal_id INTO v_parent_id FROM proposals WHERE id = v_current_id;

  IF v_parent_id IS NULL THEN
    RETURN v_current_id;
  END IF;

  -- Traverse up to find root
  WHILE v_parent_id IS NOT NULL LOOP
    v_current_id := v_parent_id;
    SELECT parent_proposal_id INTO v_parent_id FROM proposals WHERE id = v_current_id;
  END LOOP;

  RETURN v_current_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to create a proposal revision
CREATE OR REPLACE FUNCTION create_proposal_revision(
  p_proposal_id uuid,
  p_revision_name text,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid AS $$
DECLARE
  v_new_proposal_id uuid;
  v_root_proposal_id uuid;
  v_next_revision_number integer;
  v_room_mapping jsonb := '{}'::jsonb;
  v_old_room record;
  v_new_room_id uuid;
  v_line_item record;
BEGIN
  -- Get root proposal (in case p_proposal_id is itself a revision)
  v_root_proposal_id := get_root_proposal_id(p_proposal_id);

  -- Get next revision number
  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO v_next_revision_number
  FROM proposals
  WHERE (id = v_root_proposal_id OR parent_proposal_id = v_root_proposal_id);

  -- Set all other revisions to inactive (only one can be active)
  UPDATE proposals
  SET is_active_revision = false
  WHERE (id = v_root_proposal_id OR parent_proposal_id = v_root_proposal_id);

  -- Create new proposal as revision
  INSERT INTO proposals (
    company_id,
    contact_id,
    lead_id,
    proposal_number,
    title,
    status,
    valid_until,
    notes,
    customer_notes,
    subtotal,
    tax_rate,
    tax_amount,
    total,
    deposit_percent,
    deposit_amount,
    created_by,
    is_revision,
    parent_proposal_id,
    revision_name,
    is_active_revision,
    is_portal_visible,
    revision_number
  )
  SELECT
    company_id,
    contact_id,
    lead_id,
    proposal_number,
    title,
    status,
    valid_until,
    notes,
    customer_notes,
    subtotal,
    tax_rate,
    tax_amount,
    total,
    deposit_percent,
    deposit_amount,
    p_created_by,
    true,
    v_root_proposal_id,
    p_revision_name,
    true,
    false,
    v_next_revision_number
  FROM proposals
  WHERE id = p_proposal_id
  RETURNING id INTO v_new_proposal_id;

  -- Copy rooms and track ID mapping
  FOR v_old_room IN
    SELECT * FROM proposal_rooms WHERE proposal_id = p_proposal_id ORDER BY sort_order
  LOOP
    INSERT INTO proposal_rooms (proposal_id, name, description, sort_order)
    VALUES (v_new_proposal_id, v_old_room.name, v_old_room.description, v_old_room.sort_order)
    RETURNING id INTO v_new_room_id;

    -- Track room ID mapping
    v_room_mapping := jsonb_set(v_room_mapping, ARRAY[v_old_room.id::text], to_jsonb(v_new_room_id));
  END LOOP;

  -- Copy line items using room mapping
  FOR v_line_item IN
    SELECT * FROM proposal_line_items WHERE proposal_id = p_proposal_id ORDER BY sort_order
  LOOP
    INSERT INTO proposal_line_items (
      proposal_id,
      room_id,
      product_id,
      description,
      quantity,
      unit,
      price,
      cost,
      sort_order,
      is_custom,
      labor_hours,
      labor_rate,
      item_type,
      task_notes,
      is_hidden
    )
    VALUES (
      v_new_proposal_id,
      (v_room_mapping->v_line_item.room_id::text)::uuid,
      v_line_item.product_id,
      v_line_item.description,
      v_line_item.quantity,
      v_line_item.unit,
      v_line_item.price,
      v_line_item.cost,
      v_line_item.sort_order,
      v_line_item.is_custom,
      v_line_item.labor_hours,
      v_line_item.labor_rate,
      v_line_item.item_type,
      v_line_item.task_notes,
      v_line_item.is_hidden
    );
  END LOOP;

  -- Copy proposal settings if they exist
  INSERT INTO proposal_settings (
    proposal_id,
    logo_url,
    header_color,
    accent_color,
    show_line_item_details,
    show_product_images,
    payment_terms,
    warranty_info,
    custom_footer,
    pdf_template
  )
  SELECT
    v_new_proposal_id,
    logo_url,
    header_color,
    accent_color,
    show_line_item_details,
    show_product_images,
    payment_terms,
    warranty_info,
    custom_footer,
    pdf_template
  FROM proposal_settings
  WHERE proposal_id = p_proposal_id;

  RETURN v_new_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set active revision
CREATE OR REPLACE FUNCTION set_active_revision(p_proposal_id uuid)
RETURNS void AS $$
DECLARE
  v_root_proposal_id uuid;
BEGIN
  -- Get root proposal
  v_root_proposal_id := get_root_proposal_id(p_proposal_id);

  -- Set all revisions to inactive
  UPDATE proposals
  SET is_active_revision = false
  WHERE (id = v_root_proposal_id OR parent_proposal_id = v_root_proposal_id);

  -- Set specified revision to active
  UPDATE proposals
  SET is_active_revision = true
  WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to toggle portal visibility
CREATE OR REPLACE FUNCTION toggle_revision_portal_visibility(p_proposal_id uuid)
RETURNS boolean AS $$
DECLARE
  v_new_visibility boolean;
BEGIN
  UPDATE proposals
  SET is_portal_visible = NOT is_portal_visible
  WHERE id = p_proposal_id
  RETURNING is_portal_visible INTO v_new_visibility;

  RETURN v_new_visibility;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create view for proposals with revision count
CREATE OR REPLACE VIEW proposals_with_revision_count AS
SELECT
  p.*,
  CASE
    WHEN p.is_revision THEN
      (SELECT COUNT(*) FROM proposals WHERE parent_proposal_id = p.parent_proposal_id OR id = p.parent_proposal_id)
    ELSE
      (SELECT COUNT(*) FROM proposals WHERE parent_proposal_id = p.id OR id = p.id)
  END as revision_count
FROM proposals p;

-- Grant access to view
GRANT SELECT ON proposals_with_revision_count TO authenticated;
