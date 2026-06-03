/*
  # Fix change_order_history performed_by NOT NULL constraint

  The log_change_order_action() trigger uses auth.uid() to populate performed_by,
  but auth.uid() can return NULL when called from a SECURITY DEFINER context or
  when the auth context is not fully available during the trigger execution.

  Making performed_by nullable prevents the NOT NULL violation that blocks
  all change order creation.
*/
ALTER TABLE change_order_history ALTER COLUMN performed_by DROP NOT NULL;
