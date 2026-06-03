/*
  # Add Active Change Order State and Line Item Linking

  ## Changes Made

  ### Modified Tables

  1. `change_orders`
     - Added `is_active` (boolean, default false): Marks which CO is currently being edited.
       Only one CO per sales_order_id can be active at a time (enforced at application layer).

  2. `change_order_line_items`
     - Added `proposal_line_item_id` (uuid, nullable, FK → proposal_line_items.id):
       Links each CO line item record to the specific live proposal_line_item it tracks.
       Used for revert-on-delete logic and versioned view construction.
       NULL for 'add' actions where the item did not previously exist.
     - Added `room_name` (text, nullable): Snapshot of the room name at time of CO recording,
       for display in the CO report without needing to join back to rooms.

  ## Notes
  - is_active is a simple boolean; the application deactivates all COs for a sales_order_id
    before activating a new one, preventing multiple active COs.
  - proposal_line_item_id uses SET NULL on delete so CO history is preserved even if
    the line item is later removed (the CO record still shows the change happened).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN is_active boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_line_items' AND column_name = 'proposal_line_item_id'
  ) THEN
    ALTER TABLE change_order_line_items
      ADD COLUMN proposal_line_item_id uuid REFERENCES proposal_line_items(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_line_items' AND column_name = 'room_name'
  ) THEN
    ALTER TABLE change_order_line_items ADD COLUMN room_name text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_change_orders_is_active ON change_orders(sales_order_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_change_order_line_items_proposal_line_item_id ON change_order_line_items(proposal_line_item_id);
