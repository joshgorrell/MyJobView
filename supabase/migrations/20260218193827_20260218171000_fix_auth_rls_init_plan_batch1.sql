/*
  # Fix Auth RLS Initialization Plan - Batch 1

  ## Summary
  Updates RLS policies to use `(select auth.uid())` instead of `auth.uid()` directly.
  This prevents PostgreSQL from re-evaluating the auth function for every row,
  dramatically improving query performance on large tables.

  ## Tables Fixed
  - commission_statements
  - company_settings
  - discount_code_redemptions
  - invoice_line_items
  - labor_categories
  - labor_phase_mapping_audit
  - labor_phase_performance_mapping
  - message_threads (portal users)
  - messages (portal users + delete)
*/

-- commission_statements
DROP POLICY IF EXISTS "Users can view own statements" ON commission_statements;
CREATE POLICY "Users can view own statements"
  ON commission_statements FOR SELECT
  TO authenticated
  USING (employee_id = (SELECT auth.uid()));

-- company_settings
DROP POLICY IF EXISTS "Admin users can insert company settings" ON company_settings;
CREATE POLICY "Admin users can insert company settings"
  ON company_settings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));

-- discount_code_redemptions
DROP POLICY IF EXISTS "Org members can view own redemptions" ON discount_code_redemptions;
CREATE POLICY "Org members can view own redemptions"
  ON discount_code_redemptions FOR SELECT
  TO authenticated
  USING (organization_id = (
    SELECT profiles.organization_id FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
  ));

-- invoice_line_items
DROP POLICY IF EXISTS "Portal users can view their invoice line items" ON invoice_line_items;
CREATE POLICY "Portal users can view their invoice line items"
  ON invoice_line_items FOR SELECT
  TO authenticated
  USING (invoice_id IN (
    SELECT inv.id FROM invoices inv
    JOIN contacts c ON inv.contact_id = c.id
    WHERE c.portal_user_id = (SELECT auth.uid())
  ));

-- labor_categories
DROP POLICY IF EXISTS "Admins can manage labor categories" ON labor_categories;
CREATE POLICY "Admins can manage labor categories"
  ON labor_categories FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));

-- labor_phase_mapping_audit
DROP POLICY IF EXISTS "Only admins can insert audit records" ON labor_phase_mapping_audit;
CREATE POLICY "Only admins can insert audit records"
  ON labor_phase_mapping_audit FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'owner'])
  ));

-- labor_phase_performance_mapping
DROP POLICY IF EXISTS "Only admins can insert labor phase mappings" ON labor_phase_performance_mapping;
CREATE POLICY "Only admins can insert labor phase mappings"
  ON labor_phase_performance_mapping FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'owner'])
  ));

DROP POLICY IF EXISTS "Only admins can update labor phase mappings" ON labor_phase_performance_mapping;
CREATE POLICY "Only admins can update labor phase mappings"
  ON labor_phase_performance_mapping FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'owner'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'owner'])
  ));

-- message_threads: portal users
DROP POLICY IF EXISTS "Portal users can view their public message threads" ON message_threads;
CREATE POLICY "Portal users can view their public message threads"
  ON message_threads FOR SELECT
  TO authenticated
  USING (
    visibility = 'public'
    AND (
      (context_type = 'contact' AND context_id IN (
        SELECT contacts.id FROM contacts WHERE contacts.portal_user_id = (SELECT auth.uid())
      ))
      OR (context_type = 'proposal' AND context_id IN (
        SELECT p.id FROM proposals p
        JOIN contacts c ON p.contact_id = c.id
        WHERE c.portal_user_id = (SELECT auth.uid())
      ))
      OR (context_type = 'project' AND context_id IN (
        SELECT pr.id FROM projects pr
        JOIN contacts c ON pr.contact_id = c.id
        WHERE c.portal_user_id = (SELECT auth.uid())
      ))
    )
  );

-- messages: portal users
DROP POLICY IF EXISTS "Portal users can create messages in their public threads" ON messages;
CREATE POLICY "Portal users can create messages in their public threads"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (thread_id IN (
    SELECT message_threads.id FROM message_threads
    WHERE message_threads.visibility = 'public'
      AND (
        (message_threads.context_type = 'contact' AND message_threads.context_id IN (
          SELECT contacts.id FROM contacts WHERE contacts.portal_user_id = (SELECT auth.uid())
        ))
        OR (message_threads.context_type = 'proposal' AND message_threads.context_id IN (
          SELECT p.id FROM proposals p
          JOIN contacts c ON p.contact_id = c.id
          WHERE c.portal_user_id = (SELECT auth.uid())
        ))
        OR (message_threads.context_type = 'project' AND message_threads.context_id IN (
          SELECT pr.id FROM projects pr
          JOIN contacts c ON pr.contact_id = c.id
          WHERE c.portal_user_id = (SELECT auth.uid())
        ))
      )
  ));

DROP POLICY IF EXISTS "Portal users can view messages in their public threads" ON messages;
CREATE POLICY "Portal users can view messages in their public threads"
  ON messages FOR SELECT
  TO authenticated
  USING (thread_id IN (
    SELECT message_threads.id FROM message_threads
    WHERE message_threads.visibility = 'public'
      AND (
        (message_threads.context_type = 'contact' AND message_threads.context_id IN (
          SELECT contacts.id FROM contacts WHERE contacts.portal_user_id = (SELECT auth.uid())
        ))
        OR (message_threads.context_type = 'proposal' AND message_threads.context_id IN (
          SELECT p.id FROM proposals p
          JOIN contacts c ON p.contact_id = c.id
          WHERE c.portal_user_id = (SELECT auth.uid())
        ))
        OR (message_threads.context_type = 'project' AND message_threads.context_id IN (
          SELECT pr.id FROM projects pr
          JOIN contacts c ON pr.contact_id = c.id
          WHERE c.portal_user_id = (SELECT auth.uid())
        ))
      )
  ));

DROP POLICY IF EXISTS "messages_delete_same_org" ON messages;
CREATE POLICY "messages_delete_same_org"
  ON messages FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id() AND author_id = (SELECT auth.uid()));
