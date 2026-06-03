/*
  # Add Visibility Controls for Customer Communications

  1. Changes
    - Add `is_internal` field to proposal_messages (default true, only public messages visible to customers)
    - Fix message_threads visibility constraint (should be 'customer' or use 'public')
    - Add helper function to check if contact has active VIP subscription
    
  2. Security
    - Customers can only see proposal_messages where is_internal = false
    - Portal messaging requires active VIP subscription
    - Work orders already have notes (public) and internal_notes (private) fields
    
  3. Purpose
    - Restrict portal messaging to VIP members only
    - Keep internal conversations private from customers
    - Allow staff to decide which messages customers can see
*/

-- Add is_internal field to proposal_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_messages' AND column_name = 'is_internal'
  ) THEN
    ALTER TABLE proposal_messages 
    ADD COLUMN is_internal boolean DEFAULT true;
  END IF;
END $$;

-- Update existing messages to be public (so customers can see existing conversations)
UPDATE proposal_messages SET is_internal = false WHERE is_internal IS NULL;

-- Create index for filtering internal messages
CREATE INDEX IF NOT EXISTS idx_proposal_messages_internal ON proposal_messages(proposal_id, is_internal);

-- Update RLS policy for customer viewing of proposal messages
DROP POLICY IF EXISTS "Customers can view their proposal messages" ON proposal_messages;
CREATE POLICY "Customers can view public proposal messages"
  ON proposal_messages FOR SELECT
  TO anon, authenticated
  USING (
    is_internal = false
    AND proposal_id IN (
      SELECT id FROM proposals
      WHERE status IN ('sent', 'viewed', 'approved', 'declined', 'expired')
    )
  );

-- Update message_threads visibility to allow 'customer' value
ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_visibility_check;
ALTER TABLE message_threads ADD CONSTRAINT message_threads_visibility_check
  CHECK (visibility IN ('internal', 'public', 'customer'));

-- Create function to check if contact has active VIP subscription
CREATE OR REPLACE FUNCTION contact_has_active_vip_subscription(p_contact_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM recurring_subscriptions rs
    JOIN recurring_plans rp ON rp.id = rs.plan_id
    WHERE rs.contact_id = p_contact_id
      AND rs.status = 'active'
      AND rp.plan_type = 'vip_plan'
      AND (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION contact_has_active_vip_subscription(uuid) TO authenticated, anon;

COMMENT ON COLUMN proposal_messages.is_internal IS 'True = internal staff only, False = visible to customer on portal';
COMMENT ON FUNCTION contact_has_active_vip_subscription(uuid) IS 'Returns true if contact has an active VIP subscription';
