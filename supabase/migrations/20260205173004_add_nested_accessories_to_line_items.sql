/*
  # Add Nested Product Accessories Support

  1. Changes
    - Add `parent_item_id` column to `proposal_line_items` to support nested/accessory items
    - Add `display_mode` column to track how accessories should be displayed
    - Add `sort_order` column to maintain consistent ordering within accessories
    - Add foreign key constraint for parent-child relationship
    - Add index for performance on parent_item_id lookups

  2. Display Modes
    - 'itemized': Show all items including accessories as separate line items
    - 'bundle': Show only parent item with accessories rolled into parent total
    - 'collapsed': Show parent with text summary of included accessories

  3. Security
    - No RLS changes needed - inherits from existing proposal_line_items policies
*/

-- Add parent_item_id for nested relationships
ALTER TABLE proposal_line_items
ADD COLUMN IF NOT EXISTS parent_item_id uuid REFERENCES proposal_line_items(id) ON DELETE CASCADE;

-- Add display mode for how accessories are shown
ALTER TABLE proposal_line_items
ADD COLUMN IF NOT EXISTS display_mode text DEFAULT 'itemized' CHECK (display_mode IN ('itemized', 'bundle', 'collapsed'));

-- Add sort order for maintaining order within accessories
ALTER TABLE proposal_line_items
ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Add index for parent_item_id lookups
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_parent_item_id ON proposal_line_items(parent_item_id);

-- Add index for sorting within a proposal
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_sort_order ON proposal_line_items(proposal_id, sort_order);

-- Add comment for documentation
COMMENT ON COLUMN proposal_line_items.parent_item_id IS 'Reference to parent line item for nested accessories. NULL = top-level item';
COMMENT ON COLUMN proposal_line_items.display_mode IS 'How to display this item and its accessories: itemized, bundle, or collapsed';
COMMENT ON COLUMN proposal_line_items.sort_order IS 'Order of items within proposal. Accessories sort under their parent';
