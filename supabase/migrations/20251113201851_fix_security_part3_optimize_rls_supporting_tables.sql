/*
  # Fix Database Security - Part 3: Optimize RLS Policies (Supporting Tables)

  ## Changes
  - Optimized RLS policies for supporting tables
  - Wraps auth.uid() in subqueries for better performance
  
  ## Tables Updated
  - contact_captures
  - discussion_post_likes
  - lead_messages
  - lead_tags
  - feature_suggestions
  - company_offices
  - company_settings
  - quickbooks_settings
  - quickbooks_synced_customers
  - user_offices
  - contacts
*/

-- Contact captures
DROP POLICY IF EXISTS "Users can view their own contact captures" ON public.contact_captures;
CREATE POLICY "Users can view their own contact captures"
  ON public.contact_captures FOR SELECT
  TO authenticated
  USING (captured_by = (select auth.uid()));

-- Discussion post likes
DROP POLICY IF EXISTS "Users can like posts" ON public.discussion_post_likes;
CREATE POLICY "Users can like posts"
  ON public.discussion_post_likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can unlike posts" ON public.discussion_post_likes;
CREATE POLICY "Users can unlike posts"
  ON public.discussion_post_likes FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Lead messages
DROP POLICY IF EXISTS "Authenticated users can create messages" ON public.lead_messages;
CREATE POLICY "Authenticated users can create messages"
  ON public.lead_messages FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view messages for leads they can see" ON public.lead_messages;
CREATE POLICY "Users can view messages for leads they can see"
  ON public.lead_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = lead_messages.lead_id 
      AND (
        leads.assigned_to = (select auth.uid()) OR 
        leads.assigned_to IS NULL OR
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
        )
      )
    )
  );

-- Lead tags
DROP POLICY IF EXISTS "Users can view tags for leads they can see" ON public.lead_tags;
CREATE POLICY "Users can view tags for leads they can see"
  ON public.lead_tags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = lead_tags.lead_id 
      AND (
        leads.assigned_to = (select auth.uid()) OR 
        leads.assigned_to IS NULL OR
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
        )
      )
    )
  );

-- Feature suggestions
DROP POLICY IF EXISTS "Admins can update any suggestion" ON public.feature_suggestions;
CREATE POLICY "Admins can update any suggestion"
  ON public.feature_suggestions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can create their own suggestions" ON public.feature_suggestions;
CREATE POLICY "Users can create their own suggestions"
  ON public.feature_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view their own suggestions" ON public.feature_suggestions;
CREATE POLICY "Users can view their own suggestions"
  ON public.feature_suggestions FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Company offices
DROP POLICY IF EXISTS "Only admins can delete company offices" ON public.company_offices;
CREATE POLICY "Only admins can delete company offices"
  ON public.company_offices FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Only admins can insert company offices" ON public.company_offices;
CREATE POLICY "Only admins can insert company offices"
  ON public.company_offices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Only admins can update company offices" ON public.company_offices;
CREATE POLICY "Only admins can update company offices"
  ON public.company_offices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- Company settings
DROP POLICY IF EXISTS "Only admins can insert company settings" ON public.company_settings;
CREATE POLICY "Only admins can insert company settings"
  ON public.company_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Only admins can update company settings" ON public.company_settings;
CREATE POLICY "Only admins can update company settings"
  ON public.company_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- QuickBooks
DROP POLICY IF EXISTS "Admins can view synced customers" ON public.quickbooks_synced_customers;
CREATE POLICY "Admins can view synced customers"
  ON public.quickbooks_synced_customers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete QuickBooks settings" ON public.quickbooks_settings;
CREATE POLICY "Admins can delete QuickBooks settings"
  ON public.quickbooks_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert QuickBooks settings" ON public.quickbooks_settings;
CREATE POLICY "Admins can insert QuickBooks settings"
  ON public.quickbooks_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update QuickBooks settings" ON public.quickbooks_settings;
CREATE POLICY "Admins can update QuickBooks settings"
  ON public.quickbooks_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can view QuickBooks settings" ON public.quickbooks_settings;
CREATE POLICY "Admins can view QuickBooks settings"
  ON public.quickbooks_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- User offices
DROP POLICY IF EXISTS "Admins can delete office assignments" ON public.user_offices;
CREATE POLICY "Admins can delete office assignments"
  ON public.user_offices FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert office assignments" ON public.user_offices;
CREATE POLICY "Admins can insert office assignments"
  ON public.user_offices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can view all office assignments" ON public.user_offices;
CREATE POLICY "Admins can view all office assignments"
  ON public.user_offices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can view their own office assignments" ON public.user_offices;
CREATE POLICY "Users can view their own office assignments"
  ON public.user_offices FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Contacts
DROP POLICY IF EXISTS "Only admins can delete contacts" ON public.contacts;
CREATE POLICY "Only admins can delete contacts"
  ON public.contacts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can update contacts they created or assigned to" ON public.contacts;
CREATE POLICY "Users can update contacts they created or assigned to"
  ON public.contacts FOR UPDATE
  TO authenticated
  USING (
    created_by = (select auth.uid()) OR 
    assigned_to = (select auth.uid()) OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );