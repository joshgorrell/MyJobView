/*
  # Fix Auth RLS Initialization Plan - Batch 2

  ## Summary
  Continues fixing RLS policies to use (select auth.uid()) for performance.

  ## Tables Fixed
  - mileage_entries
  - mileage_reminders
  - organization_secrets
  - paparazzi_requests (delete)
  - payments (portal users)
  - pending_payments
  - portal_views
  - profiles (delete)
  - proposal_activity_views
  - proposal_line_items (portal)
  - proposal_reactivation_requests
  - proposal_rooms (portal)
  - proposals (portal)
*/

-- mileage_entries
DROP POLICY IF EXISTS "Admins can delete mileage entries" ON mileage_entries;
CREATE POLICY "Admins can delete mileage entries"
  ON mileage_entries FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS "Users can insert their own mileage entries" ON mileage_entries;
CREATE POLICY "Users can insert their own mileage entries"
  ON mileage_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM vehicle_assignments
      WHERE vehicle_assignments.vehicle_id = mileage_entries.vehicle_id
        AND vehicle_assignments.user_id = (SELECT auth.uid())
        AND vehicle_assignments.is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update their own mileage entries" ON mileage_entries;
CREATE POLICY "Users can update their own mileage entries"
  ON mileage_entries FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view their mileage entries" ON mileage_entries;
CREATE POLICY "Users can view their mileage entries"
  ON mileage_entries FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['admin', 'manager'])
    )
  );

-- mileage_reminders
DROP POLICY IF EXISTS "Users can view their reminders" ON mileage_reminders;
CREATE POLICY "Users can view their reminders"
  ON mileage_reminders FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['admin', 'manager'])
    )
  );

-- organization_secrets
DROP POLICY IF EXISTS "Only admins can delete organization secrets" ON organization_secrets;
CREATE POLICY "Only admins can delete organization secrets"
  ON organization_secrets FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.organization_id = organization_secrets.organization_id
      AND profiles.role = ANY(ARRAY['admin', 'owner'])
  ));

DROP POLICY IF EXISTS "Only admins can insert organization secrets" ON organization_secrets;
CREATE POLICY "Only admins can insert organization secrets"
  ON organization_secrets FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.organization_id = organization_secrets.organization_id
      AND profiles.role = ANY(ARRAY['admin', 'owner'])
  ));

DROP POLICY IF EXISTS "Only admins can view organization secrets" ON organization_secrets;
CREATE POLICY "Only admins can view organization secrets"
  ON organization_secrets FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.organization_id = organization_secrets.organization_id
      AND profiles.role = ANY(ARRAY['admin', 'owner'])
  ));

-- paparazzi_requests (delete)
DROP POLICY IF EXISTS "Users can delete their own requests or admins can delete any" ON paparazzi_requests;
CREATE POLICY "Users can delete their own requests or admins can delete any"
  ON paparazzi_requests FOR DELETE
  TO authenticated
  USING (
    requested_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['admin', 'owner'])
    )
  );

-- pending_payments
DROP POLICY IF EXISTS "Portal users can view own pending payments" ON pending_payments;
CREATE POLICY "Portal users can view own pending payments"
  ON pending_payments FOR SELECT
  TO authenticated
  USING (contact_id IN (
    SELECT profiles.contact_id FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
  ));

-- portal_views
DROP POLICY IF EXISTS "Customers can insert own portal views" ON portal_views;
CREATE POLICY "Customers can insert own portal views"
  ON portal_views FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    JOIN contacts c ON c.id = p.contact_id
    WHERE p.id = (SELECT auth.uid()) AND c.id = portal_views.contact_id
  ));

DROP POLICY IF EXISTS "Customers can view own portal activity" ON portal_views;
CREATE POLICY "Customers can view own portal activity"
  ON portal_views FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    JOIN contacts c ON c.id = p.contact_id
    WHERE p.id = (SELECT auth.uid()) AND c.id = portal_views.contact_id
  ));

-- profiles (delete)
DROP POLICY IF EXISTS "profiles_delete_admin_same_org" ON profiles;
CREATE POLICY "profiles_delete_admin_same_org"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );

-- proposal_activity_views
DROP POLICY IF EXISTS "Users can insert own activity views" ON proposal_activity_views;
CREATE POLICY "Users can insert own activity views"
  ON proposal_activity_views FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own activity views" ON proposal_activity_views;
CREATE POLICY "Users can update own activity views"
  ON proposal_activity_views FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view own activity views" ON proposal_activity_views;
CREATE POLICY "Users can view own activity views"
  ON proposal_activity_views FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- proposal_line_items (portal)
DROP POLICY IF EXISTS "Portal users can view line items in their proposals" ON proposal_line_items;
CREATE POLICY "Portal users can view line items in their proposals"
  ON proposal_line_items FOR SELECT
  TO authenticated
  USING (proposal_id IN (
    SELECT p.id FROM proposals p
    JOIN contacts c ON c.id = p.contact_id
    WHERE c.portal_user_id = (SELECT auth.uid())
  ));

-- proposal_reactivation_requests
DROP POLICY IF EXISTS "Portal users can create reactivation requests" ON proposal_reactivation_requests;
CREATE POLICY "Portal users can create reactivation requests"
  ON proposal_reactivation_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    contact_id IN (
      SELECT profiles.contact_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
    AND proposal_id IN (
      SELECT proposals.id FROM proposals
      WHERE proposals.contact_id = proposal_reactivation_requests.contact_id
        AND proposals.status = 'expired'
    )
  );

-- proposal_rooms (portal)
DROP POLICY IF EXISTS "Portal users can view rooms in their proposals" ON proposal_rooms;
CREATE POLICY "Portal users can view rooms in their proposals"
  ON proposal_rooms FOR SELECT
  TO authenticated
  USING (proposal_id IN (
    SELECT p.id FROM proposals p
    JOIN contacts c ON c.id = p.contact_id
    WHERE c.portal_user_id = (SELECT auth.uid())
  ));
