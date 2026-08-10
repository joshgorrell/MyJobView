/*
# Allow Submitted Purchase Order Status

## Summary
Extends the purchase order status list so a PO can be explicitly submitted before receiving begins.

## Changes
- Replace the purchase order status check with an equivalent check that also allows `submitted`.
- No data is deleted or changed.
- Existing draft, sent, partial, received, and cancelled values remain valid.
*/

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'sent'::text, 'partial'::text, 'received'::text, 'cancelled'::text]));
