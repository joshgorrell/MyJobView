/*
# Allow request creators to delete their own product requests

1. Purpose
- Today only managers (admin, office_manager, purchasing, service_manager, production_manager)
  can delete a product_request, via the existing "Managers can manage product requests" FOR ALL policy.
- A regular user who creates a request by mistake cannot remove it.
- This adds a dedicated DELETE policy so the creator (requested_by) can delete their own request.
- The "no purchase order yet" guard is enforced in the application layer before calling delete,
  so users get a clear message instead of a silent database error.

2. Security
- New DELETE policy on product_requests, scoped TO authenticated.
- USING predicate: auth.uid() = requested_by (only the creator can delete their own row).
- Managers keep their existing broader delete ability via the FOR ALL policy; no change there.
- product_request_items cascade-delete with the parent (ON DELETE CASCADE already set), so no orphaned items.
*/

DROP POLICY IF EXISTS "Creators can delete own product requests" ON product_requests;

CREATE POLICY "Creators can delete own product requests"
  ON product_requests FOR DELETE
  TO authenticated
  USING (auth.uid() = requested_by);
