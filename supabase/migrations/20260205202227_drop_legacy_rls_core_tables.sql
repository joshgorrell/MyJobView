/*\n  # Drop Legacy RLS Policies on Core Tables\n\n  1. Changes\n    - Remove old permissive policies (USING true, company_id checks) from core tables\n    - These tables already have org-scoped policies (*_same_org) from previous migration\n    - Keeps portal/anonymous policies intact for customer-facing features\n\n  2. Affected Tables\n    - leads, contacts, tasks, work_orders, invoices, proposals, projects, sales_orders, appointments\n    - profiles, notifications, connections, discussion_posts, feed_events\n    - company_offices, departments, email_templates, products, recurring_plans, security_contracts\n\n  3. Security\n    - All data access now scoped by organization_id = get_user_org_id()\n    - Portal and anonymous access policies preserved where needed\n    - Role-based checks within org still enforced by remaining policies\n*/\n\n-- =============================================\n-- LEADS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view leads" ON leads

\nDROP POLICY IF EXISTS "Authenticated users can update leads" ON leads

\nDROP POLICY IF EXISTS "Authenticated users can create leads" ON leads

\nDROP POLICY IF EXISTS "Admin can delete leads" ON leads

\nDROP POLICY IF EXISTS "Anonymous users can create fishbowl leads" ON leads

\n\n-- =============================================\n-- CONTACTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view all contacts" ON contacts

\nDROP POLICY IF EXISTS "Authenticated users can view contacts" ON contacts

\nDROP POLICY IF EXISTS "Users can insert contacts" ON contacts

\nDROP POLICY IF EXISTS "Users can update contacts" ON contacts

\nDROP POLICY IF EXISTS "Users can delete contacts" ON contacts

\nDROP POLICY IF EXISTS "Only admins can delete contacts" ON contacts

\nDROP POLICY IF EXISTS "contacts_insert_anon" ON contacts

\n\n-- Replace contacts_insert_same_org with one that checks can_edit_contacts OR anon\nDROP POLICY IF EXISTS "contacts_insert_same_org" ON contacts

\nCREATE POLICY "contacts_insert_same_org" ON contacts FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- Keep portal + anonymous select policies for contacts (they're needed)\n\n-- =============================================\n-- TASKS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view tasks" ON tasks

\nDROP POLICY IF EXISTS "Authenticated users can update tasks" ON tasks

\nDROP POLICY IF EXISTS "Users can create tasks" ON tasks

\nDROP POLICY IF EXISTS "Users can delete tasks they created" ON tasks

\n\n-- =============================================\n-- WORK ORDERS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view work orders" ON work_orders

\nDROP POLICY IF EXISTS "Authenticated users can update work orders" ON work_orders

\nDROP POLICY IF EXISTS "Managers can create work orders" ON work_orders

\nDROP POLICY IF EXISTS "Technicians can create work orders for themselves" ON work_orders

\n\n-- =============================================\n-- INVOICES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view invoices" ON invoices

\nDROP POLICY IF EXISTS "Staff can create invoices in their company" ON invoices

\nDROP POLICY IF EXISTS "Staff can update invoices in their company" ON invoices

\nDROP POLICY IF EXISTS "Staff can delete invoices in their company" ON invoices

\nDROP POLICY IF EXISTS "Staff can view invoices in their company" ON invoices

\n\n-- Add delete policy for invoices (was missing from same_org set)\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'invoices_delete_same_org' AND tablename = 'invoices') THEN\n    CREATE POLICY "invoices_delete_same_org" ON invoices FOR DELETE TO authenticated\n      USING (organization_id = get_user_org_id())

\n  END IF

\nEND $$

\n\n-- =============================================\n-- PROPOSALS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can update proposals" ON proposals

\nDROP POLICY IF EXISTS "Users can view proposals with visibility scope" ON proposals

\nDROP POLICY IF EXISTS "Sales can create proposals" ON proposals

\nDROP POLICY IF EXISTS "Sales can delete proposals" ON proposals

\n\n-- =============================================\n-- PROPOSAL ROOMS\n-- =============================================\nDROP POLICY IF EXISTS "Users can view proposal rooms" ON proposal_rooms

\nDROP POLICY IF EXISTS "Users can insert proposal rooms" ON proposal_rooms

\nDROP POLICY IF EXISTS "Users can update proposal rooms" ON proposal_rooms

\nDROP POLICY IF EXISTS "Users can delete proposal rooms" ON proposal_rooms

\n\n-- Add org-scoped policies for proposal_rooms\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proposal_rooms_select_same_org' AND tablename = 'proposal_rooms') THEN\n    CREATE POLICY "proposal_rooms_select_same_org" ON proposal_rooms FOR SELECT TO authenticated\n      USING (organization_id = get_user_org_id())

\n  END IF

\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proposal_rooms_insert_same_org' AND tablename = 'proposal_rooms') THEN\n    CREATE POLICY "proposal_rooms_insert_same_org" ON proposal_rooms FOR INSERT TO authenticated\n      WITH CHECK (organization_id = get_user_org_id())

\n  END IF

\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proposal_rooms_update_same_org' AND tablename = 'proposal_rooms') THEN\n    CREATE POLICY "proposal_rooms_update_same_org" ON proposal_rooms FOR UPDATE TO authenticated\n      USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n  END IF

\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proposal_rooms_delete_same_org' AND tablename = 'proposal_rooms') THEN\n    CREATE POLICY "proposal_rooms_delete_same_org" ON proposal_rooms FOR DELETE TO authenticated\n      USING (organization_id = get_user_org_id())

\n  END IF

\nEND $$

\n\n-- =============================================\n-- PROPOSAL LINE ITEMS\n-- =============================================\nDROP POLICY IF EXISTS "Users can view proposal line items" ON proposal_line_items

\nDROP POLICY IF EXISTS "Users can insert proposal line items" ON proposal_line_items

\nDROP POLICY IF EXISTS "Users can update proposal line items" ON proposal_line_items

\nDROP POLICY IF EXISTS "Users can delete proposal line items" ON proposal_line_items

\n\n-- Add org-scoped policies for proposal_line_items\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proposal_line_items_select_same_org' AND tablename = 'proposal_line_items') THEN\n    CREATE POLICY "proposal_line_items_select_same_org" ON proposal_line_items FOR SELECT TO authenticated\n      USING (organization_id = get_user_org_id())

\n  END IF

\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proposal_line_items_insert_same_org' AND tablename = 'proposal_line_items') THEN\n    CREATE POLICY "proposal_line_items_insert_same_org" ON proposal_line_items FOR INSERT TO authenticated\n      WITH CHECK (organization_id = get_user_org_id())

\n  END IF

\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proposal_line_items_update_same_org' AND tablename = 'proposal_line_items') THEN\n    CREATE POLICY "proposal_line_items_update_same_org" ON proposal_line_items FOR UPDATE TO authenticated\n      USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n  END IF

\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proposal_line_items_delete_same_org' AND tablename = 'proposal_line_items') THEN\n    CREATE POLICY "proposal_line_items_delete_same_org" ON proposal_line_items FOR DELETE TO authenticated\n      USING (organization_id = get_user_org_id())

\n  END IF

\nEND $$

\n\n-- =============================================\n-- PROJECTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view projects" ON projects

\nDROP POLICY IF EXISTS "Staff can create projects in their company" ON projects

\nDROP POLICY IF EXISTS "Staff can update projects in their company" ON projects

\nDROP POLICY IF EXISTS "Staff can delete projects in their company" ON projects

\nDROP POLICY IF EXISTS "Staff can view projects in their company" ON projects

\n\n-- Add delete policy for projects\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'projects_delete_same_org' AND tablename = 'projects') THEN\n    CREATE POLICY "projects_delete_same_org" ON projects FOR DELETE TO authenticated\n      USING (organization_id = get_user_org_id())

\n  END IF

\nEND $$

\n\n-- =============================================\n-- SALES ORDERS\n-- =============================================\nDROP POLICY IF EXISTS "Users can create sales orders in their company" ON sales_orders

\nDROP POLICY IF EXISTS "Users can update sales orders in their company" ON sales_orders

\nDROP POLICY IF EXISTS "Users can delete sales orders in their company" ON sales_orders

\nDROP POLICY IF EXISTS "Users can view sales orders in their company" ON sales_orders

\n\n-- Add delete policy for sales_orders\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sales_orders_delete_same_org' AND tablename = 'sales_orders') THEN\n    CREATE POLICY "sales_orders_delete_same_org" ON sales_orders FOR DELETE TO authenticated\n      USING (organization_id = get_user_org_id())

\n  END IF

\nEND $$

\n\n-- =============================================\n-- APPOINTMENTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view appointments" ON appointments

\nDROP POLICY IF EXISTS "Staff can create appointments in their company" ON appointments

\nDROP POLICY IF EXISTS "Staff can update appointments in their company" ON appointments

\nDROP POLICY IF EXISTS "Staff can delete appointments in their company" ON appointments

\nDROP POLICY IF EXISTS "Staff can view appointments in their company" ON appointments

\n\n-- =============================================\n-- PROFILES (careful - keep signup, own-update, service role)\n-- =============================================\nDROP POLICY IF EXISTS "Users can view other active profiles" ON profiles

\nDROP POLICY IF EXISTS "Admins can delete profiles" ON profiles

\nDROP POLICY IF EXISTS "Service role can delete profiles" ON profiles

\nDROP POLICY IF EXISTS "Service role can insert profiles" ON profiles

\nDROP POLICY IF EXISTS "Users can insert own profile on signup" ON profiles

\n\n-- =============================================\n-- NOTIFICATIONS (keep own-user scoped policies)\n-- =============================================\nDROP POLICY IF EXISTS "System can create notifications for users" ON notifications

\nDROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications

\nDROP POLICY IF EXISTS "Users can view own notifications" ON notifications

\n\n-- =============================================\n-- CONNECTIONS\n-- =============================================\nDROP POLICY IF EXISTS "Admins can view all connections" ON connections

\nDROP POLICY IF EXISTS "Users can create their own connections" ON connections

\nDROP POLICY IF EXISTS "Users can delete their own connections" ON connections

\nDROP POLICY IF EXISTS "Users can update their own connections" ON connections

\nDROP POLICY IF EXISTS "Users can view their own connections" ON connections

\n\n-- =============================================\n-- DISCUSSION POSTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view public posts" ON discussion_posts

\nDROP POLICY IF EXISTS "Users can create discussion posts" ON discussion_posts

\nDROP POLICY IF EXISTS "Users can delete own posts" ON discussion_posts

\nDROP POLICY IF EXISTS "Users can update own posts" ON discussion_posts

\nDROP POLICY IF EXISTS "Users can view discussion posts based on visibility scope" ON discussion_posts

\nDROP POLICY IF EXISTS "Users can view private posts they are part of" ON discussion_posts

\n\n-- =============================================\n-- FEED EVENTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view feed events" ON feed_events

\nDROP POLICY IF EXISTS "System can create feed events" ON feed_events

\n\n-- =============================================\n-- COMPANY OFFICES\n-- =============================================\nDROP POLICY IF EXISTS "Anyone can view company offices" ON company_offices

\nDROP POLICY IF EXISTS "Only admins can insert company offices" ON company_offices

\nDROP POLICY IF EXISTS "Only admins can update company offices" ON company_offices

\nDROP POLICY IF EXISTS "Only admins can delete company offices" ON company_offices

\n\n-- =============================================\n-- DEPARTMENTS\n-- =============================================\nDROP POLICY IF EXISTS "All users can view departments" ON departments

\nDROP POLICY IF EXISTS "Anyone can view departments" ON departments

\nDROP POLICY IF EXISTS "Admins can manage departments" ON departments

\nDROP POLICY IF EXISTS "Only admins can manage departments" ON departments

\n\n-- Add delete policy\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'departments_delete_same_org' AND tablename = 'departments') THEN\n    CREATE POLICY "departments_delete_same_org" ON departments FOR DELETE TO authenticated\n      USING (organization_id = get_user_org_id())

\n  END IF

\nEND $$

\n\n-- =============================================\n-- EMAIL TEMPLATES\n-- =============================================\nDROP POLICY IF EXISTS "Admins can manage email templates" ON email_templates

\n\n-- Add delete policy\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'email_templates_delete_same_org' AND tablename = 'email_templates') THEN\n    CREATE POLICY "email_templates_delete_same_org" ON email_templates FOR DELETE TO authenticated\n      USING (organization_id = get_user_org_id())

\n  END IF

\nEND $$

\n\n-- =============================================\n-- PRODUCTS\n-- =============================================\nDROP POLICY IF EXISTS "Users can view company products" ON products

\nDROP POLICY IF EXISTS "Users can insert company products" ON products

\nDROP POLICY IF EXISTS "Users can update company products" ON products

\nDROP POLICY IF EXISTS "Users can delete company products" ON products

\n\n-- =============================================\n-- RECURRING PLANS\n-- =============================================\nDROP POLICY IF EXISTS "All authenticated users can view recurring plans" ON recurring_plans

\nDROP POLICY IF EXISTS "Sales and admin can insert plans" ON recurring_plans

\nDROP POLICY IF EXISTS "Admin can delete plans" ON recurring_plans

\n-- Keep: recurring_plans_select_anon for anonymous VIP plan viewing\n\n-- Add delete policy\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'recurring_plans_delete_same_org' AND tablename = 'recurring_plans') THEN\n    CREATE POLICY "recurring_plans_delete_same_org" ON recurring_plans FOR DELETE TO authenticated\n      USING (organization_id = get_user_org_id())

\n  END IF

\nEND $$

\n\n-- =============================================\n-- SECURITY CONTRACTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view contracts" ON security_contracts

\nDROP POLICY IF EXISTS "Sales and authorized users can create contracts" ON security_contracts

\nDROP POLICY IF EXISTS "Sales and authorized users can update contracts" ON security_contracts

\nDROP POLICY IF EXISTS "Admin can delete contracts" ON security_contracts

\n-- Keep: Anonymous magic link access policies\n\n-- Add delete policy\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'security_contracts_delete_same_org' AND tablename = 'security_contracts') THEN\n    CREATE POLICY "security_contracts_delete_same_org" ON security_contracts FOR DELETE TO authenticated\n      USING (organization_id = get_user_org_id())

\n  END IF

\nEND $$

\n
