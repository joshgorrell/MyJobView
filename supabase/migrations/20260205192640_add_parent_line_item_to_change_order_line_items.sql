/*
  # Add parent/child accessory nesting to change order line items

  1. Modified Tables
    - `change_order_line_items`
      - `parent_line_item_id` (uuid, nullable, self-referencing FK) - links an accessory line item to its parent primary item
      - `display_mode` (text) - controls how accessories render: itemized, bundle, collapsed

  2. Indexes
    - Index on `parent_line_item_id` for fast child lookups

  3. Notes
    - ON DELETE SET NULL so removing a parent promotes children to standalone items
    - Mirrors the same pattern used in `proposal_line_items.parent_item_id`
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_line_items' AND column_name = 'parent_line_item_id'
  ) THEN
    ALTER TABLE change_order_line_items
      ADD COLUMN parent_line_item_id uuid REFERENCES change_order_line_items(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_line_items' AND column_name = 'display_mode'
  ) THEN
    ALTER TABLE change_order_line_items
      ADD COLUMN display_mode text DEFAULT 'itemized' CHECK (display_mode IN ('itemized', 'bundle', 'collapsed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_co_line_items_parent ON change_order_line_items(parent_line_item_id);
