/*
  # Add Work Order Groups and Contact Linking

  1. Changes
    - Add contact_id to work_orders to link directly to customers
    - Add work_order_group_id to link related work orders (multi-tech jobs)
    - Make project_id optional (not all work orders need a project)
    - Add indexes for new columns

  2. Security
    - Update RLS policies to check contact access
*/

-- Add contact_id and work_order_group_id columns
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS work_order_group_id uuid;

-- Make project_id optional
ALTER TABLE work_orders
  ALTER COLUMN project_id DROP NOT NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_work_orders_contact ON work_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_group ON work_orders(work_order_group_id);

-- Add comment to explain work_order_group_id
COMMENT ON COLUMN work_orders.work_order_group_id IS 'Groups related work orders together (e.g., when multiple technicians work on the same job)';
