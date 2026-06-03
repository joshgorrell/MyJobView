/*
  # Allow Technicians to Create Work Orders

  1. Changes
    - Add new RLS policy allowing technicians to create work orders for themselves
    - This enables field technicians to create on-the-fly service work orders
    - Technicians can only create work orders where they are the assigned technician

  2. Security
    - Technicians must be authenticated
    - Can only create work orders where assigned_to is themselves
    - Cannot create work orders assigned to other technicians
*/

-- Add policy allowing technicians to create work orders for themselves
CREATE POLICY "Technicians can create work orders for themselves"
  ON work_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'service_manager')
    )
  );
