/*
  # Fix Database Security - Part 6: Optimize RLS Policies (Jobs Schema)

  ## Changes
  - Optimized RLS policies for jobs schema tables
  - Wraps auth.uid() in subqueries for better performance
  
  ## Tables Updated
  - jobs.products
  - jobs.proposals
  - jobs.proposal_rooms
  - jobs.proposal_line_items
  - jobs.projects
  - jobs.invoices
  - jobs.payments
  - jobs.appointments
  - jobs.commission_records
  - jobs.message_threads
  - jobs.messages
*/

-- Products
DROP POLICY IF EXISTS "Users can delete company products" ON jobs.products;
CREATE POLICY "Users can delete company products"
  ON jobs.products FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert company products" ON jobs.products;
CREATE POLICY "Users can insert company products"
  ON jobs.products FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update company products" ON jobs.products;
CREATE POLICY "Users can update company products"
  ON jobs.products FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view company products" ON jobs.products;
CREATE POLICY "Users can view company products"
  ON jobs.products FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Proposals
DROP POLICY IF EXISTS "Users can delete company proposals" ON jobs.proposals;
CREATE POLICY "Users can delete company proposals"
  ON jobs.proposals FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert company proposals" ON jobs.proposals;
CREATE POLICY "Users can insert company proposals"
  ON jobs.proposals FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update company proposals" ON jobs.proposals;
CREATE POLICY "Users can update company proposals"
  ON jobs.proposals FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view company proposals" ON jobs.proposals;
CREATE POLICY "Users can view company proposals"
  ON jobs.proposals FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Proposal rooms
DROP POLICY IF EXISTS "Users can delete proposal rooms" ON jobs.proposal_rooms;
CREATE POLICY "Users can delete proposal rooms"
  ON jobs.proposal_rooms FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert proposal rooms" ON jobs.proposal_rooms;
CREATE POLICY "Users can insert proposal rooms"
  ON jobs.proposal_rooms FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update proposal rooms" ON jobs.proposal_rooms;
CREATE POLICY "Users can update proposal rooms"
  ON jobs.proposal_rooms FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view proposal rooms" ON jobs.proposal_rooms;
CREATE POLICY "Users can view proposal rooms"
  ON jobs.proposal_rooms FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Proposal line items
DROP POLICY IF EXISTS "Users can delete proposal line items" ON jobs.proposal_line_items;
CREATE POLICY "Users can delete proposal line items"
  ON jobs.proposal_line_items FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert proposal line items" ON jobs.proposal_line_items;
CREATE POLICY "Users can insert proposal line items"
  ON jobs.proposal_line_items FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update proposal line items" ON jobs.proposal_line_items;
CREATE POLICY "Users can update proposal line items"
  ON jobs.proposal_line_items FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view proposal line items" ON jobs.proposal_line_items;
CREATE POLICY "Users can view proposal line items"
  ON jobs.proposal_line_items FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Projects
DROP POLICY IF EXISTS "Users can delete company projects" ON jobs.projects;
CREATE POLICY "Users can delete company projects"
  ON jobs.projects FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert company projects" ON jobs.projects;
CREATE POLICY "Users can insert company projects"
  ON jobs.projects FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update company projects" ON jobs.projects;
CREATE POLICY "Users can update company projects"
  ON jobs.projects FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view company projects" ON jobs.projects;
CREATE POLICY "Users can view company projects"
  ON jobs.projects FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Invoices
DROP POLICY IF EXISTS "Users can delete company invoices" ON jobs.invoices;
CREATE POLICY "Users can delete company invoices"
  ON jobs.invoices FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert company invoices" ON jobs.invoices;
CREATE POLICY "Users can insert company invoices"
  ON jobs.invoices FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update company invoices" ON jobs.invoices;
CREATE POLICY "Users can update company invoices"
  ON jobs.invoices FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view company invoices" ON jobs.invoices;
CREATE POLICY "Users can view company invoices"
  ON jobs.invoices FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Payments
DROP POLICY IF EXISTS "Users can delete company payments" ON jobs.payments;
CREATE POLICY "Users can delete company payments"
  ON jobs.payments FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert company payments" ON jobs.payments;
CREATE POLICY "Users can insert company payments"
  ON jobs.payments FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update company payments" ON jobs.payments;
CREATE POLICY "Users can update company payments"
  ON jobs.payments FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view company payments" ON jobs.payments;
CREATE POLICY "Users can view company payments"
  ON jobs.payments FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Appointments
DROP POLICY IF EXISTS "Users can delete company appointments" ON jobs.appointments;
CREATE POLICY "Users can delete company appointments"
  ON jobs.appointments FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert company appointments" ON jobs.appointments;
CREATE POLICY "Users can insert company appointments"
  ON jobs.appointments FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update company appointments" ON jobs.appointments;
CREATE POLICY "Users can update company appointments"
  ON jobs.appointments FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view company appointments" ON jobs.appointments;
CREATE POLICY "Users can view company appointments"
  ON jobs.appointments FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Commission records
DROP POLICY IF EXISTS "Users can insert company commission records" ON jobs.commission_records;
CREATE POLICY "Users can insert company commission records"
  ON jobs.commission_records FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update company commission records" ON jobs.commission_records;
CREATE POLICY "Users can update company commission records"
  ON jobs.commission_records FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view company commission records" ON jobs.commission_records;
CREATE POLICY "Users can view company commission records"
  ON jobs.commission_records FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Message threads
DROP POLICY IF EXISTS "Users can insert company message threads" ON jobs.message_threads;
CREATE POLICY "Users can insert company message threads"
  ON jobs.message_threads FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update company message threads" ON jobs.message_threads;
CREATE POLICY "Users can update company message threads"
  ON jobs.message_threads FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view company message threads" ON jobs.message_threads;
CREATE POLICY "Users can view company message threads"
  ON jobs.message_threads FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Messages
DROP POLICY IF EXISTS "Users can insert messages in company threads" ON jobs.messages;
CREATE POLICY "Users can insert messages in company threads"
  ON jobs.messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their own messages" ON jobs.messages;
CREATE POLICY "Users can update their own messages"
  ON jobs.messages FOR UPDATE
  TO authenticated
  USING (sender_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view messages in company threads" ON jobs.messages;
CREATE POLICY "Users can view messages in company threads"
  ON jobs.messages FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);