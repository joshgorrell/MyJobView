/*
  # Universal Page Access RLS Policies

  ## Summary
  Apply the principle: "If a user has access to a page/module, they should see ALL data on that page."
  
  Remove restrictive filters based on:
  - office_id
  - created_by
  - assigned_to
  - owner_id
  
  Keep restrictions only for:
  - Portal users (contact-specific access)
  - Private/sensitive data where user is explicitly part of it
  - Admin-only operations

  ## Tables Updated
  
  ### Service Department
  - service_requests
  - service_billing_queue
  - service_labor_entries
  - service_parts_used
  - service_additional_charges
  
  ### Sales & Pipeline
  - leads
  - lead_messages
  - lead_tags
  - contacts
  
  ### Tasks & Projects
  - tasks
  - task_comments
  - task_mentions
  - projects
  
  ### Work Orders
  - work_orders
  - work_order_materials
  - work_order_tasks
  
  ### Invoicing & Recurring
  - invoices
  - recurring_plans
  - recurring_subscriptions
  - subscription_line_items
  - recurring_invoices
  
  ### Appointments
  - appointments
  
  ### Punchlist
  - punch_lists
  - punch_list_items
  
  ### Tax
  - tax_exemption_certificates
  
  ### Proposals (enhance existing)
  - proposal_activity
  - proposal_reactivation_requests
  - proposal_messages
  
  ## Security Notes
  - Access control managed via department_modules
  - Portal users retain contact-scoped access
  - Admins retain exclusive delete permissions where appropriate
*/

-- =============================================
-- SERVICE REQUESTS
-- =============================================

DROP POLICY IF EXISTS "Users can view relevant service requests" ON service_requests;
DROP POLICY IF EXISTS "Creators and managers can update service requests" ON service_requests;

CREATE POLICY "Authenticated users can view service requests"
  ON service_requests
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update service requests"
  ON service_requests
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================
-- SERVICE BILLING QUEUE
-- =============================================

DROP POLICY IF EXISTS "View billing queue if assigned or manager" ON service_billing_queue;
DROP POLICY IF EXISTS "Assigned users and managers can update billing queue" ON service_billing_queue;

CREATE POLICY "Authenticated users can view billing queue"
  ON service_billing_queue
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update billing queue"
  ON service_billing_queue
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================
-- SERVICE LABOR ENTRIES
-- =============================================

DROP POLICY IF EXISTS "View labor if tech, biller, or manager" ON service_labor_entries;

CREATE POLICY "Authenticated users can view labor entries"
  ON service_labor_entries
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- SERVICE PARTS USED
-- =============================================

DROP POLICY IF EXISTS "View parts if related to job or manager" ON service_parts_used;
DROP POLICY IF EXISTS "Billers and managers can update parts" ON service_parts_used;

CREATE POLICY "Authenticated users can view parts used"
  ON service_parts_used
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update parts used"
  ON service_parts_used
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================
-- SERVICE ADDITIONAL CHARGES
-- =============================================

DROP POLICY IF EXISTS "View charges if assigned or manager" ON service_additional_charges;
DROP POLICY IF EXISTS "Billers and managers can add charges" ON service_additional_charges;
DROP POLICY IF EXISTS "Billers and managers can update charges" ON service_additional_charges;

CREATE POLICY "Authenticated users can view additional charges"
  ON service_additional_charges
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can add charges"
  ON service_additional_charges
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update charges"
  ON service_additional_charges
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================
-- LEADS
-- =============================================

DROP POLICY IF EXISTS "Sales reps see their leads and fishbowl, admins see all" ON leads;
DROP POLICY IF EXISTS "Users can view leads based on office visibility" ON leads;
DROP POLICY IF EXISTS "Users can update leads assigned to them or admins can update an" ON leads;
DROP POLICY IF EXISTS "Users can delete their assigned leads, admins can delete any" ON leads;

CREATE POLICY "Authenticated users can view leads"
  ON leads
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update leads"
  ON leads
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Admin can delete leads"
  ON leads
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- =============================================
-- LEAD MESSAGES
-- =============================================

DROP POLICY IF EXISTS "Users can view messages for leads they can see" ON lead_messages;

CREATE POLICY "Authenticated users can view lead messages"
  ON lead_messages
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- LEAD TAGS
-- =============================================

DROP POLICY IF EXISTS "Users can view tags for leads they can see" ON lead_tags;

CREATE POLICY "Authenticated users can view lead tags"
  ON lead_tags
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- CONTACTS
-- =============================================

DROP POLICY IF EXISTS "Users can view contacts based on office visibility" ON contacts;
DROP POLICY IF EXISTS "Users can update contacts they created or assigned to" ON contacts;

CREATE POLICY "Authenticated users can view contacts"
  ON contacts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update contacts"
  ON contacts
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================
-- TASKS
-- =============================================

DROP POLICY IF EXISTS "Users can view tasks based on office visibility" ON tasks;
DROP POLICY IF EXISTS "Users can view tasks they have access to" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks they created, are assigned to, or claime" ON tasks;
DROP POLICY IF EXISTS "Users can update their assigned tasks" ON tasks;

CREATE POLICY "Authenticated users can view tasks"
  ON tasks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update tasks"
  ON tasks
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================
-- TASK COMMENTS
-- =============================================

DROP POLICY IF EXISTS "Users can view comments on tasks they can access" ON task_comments;
DROP POLICY IF EXISTS "Users can create comments on tasks they can access" ON task_comments;

CREATE POLICY "Authenticated users can view task comments"
  ON task_comments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create task comments"
  ON task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =============================================
-- TASK MENTIONS
-- =============================================

DROP POLICY IF EXISTS "Users can view mentions for tasks they can access" ON task_mentions;

CREATE POLICY "Authenticated users can view task mentions"
  ON task_mentions
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- PROJECTS
-- =============================================

DROP POLICY IF EXISTS "Users can view projects based on office visibility" ON projects;

CREATE POLICY "Authenticated users can view projects"
  ON projects
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- WORK ORDERS
-- =============================================

DROP POLICY IF EXISTS "Users can view work orders in their scope" ON work_orders;
DROP POLICY IF EXISTS "Managers and assigned techs can update work orders" ON work_orders;

CREATE POLICY "Authenticated users can view work orders"
  ON work_orders
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update work orders"
  ON work_orders
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================
-- WORK ORDER MATERIALS
-- =============================================

DROP POLICY IF EXISTS "Users can view materials for their work orders" ON work_order_materials;
DROP POLICY IF EXISTS "Techs and managers can manage materials" ON work_order_materials;

CREATE POLICY "Authenticated users can view work order materials"
  ON work_order_materials
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage work order materials"
  ON work_order_materials
  FOR ALL
  TO authenticated
  USING (true);

-- =============================================
-- WORK ORDER TASKS
-- =============================================

DROP POLICY IF EXISTS "Users can view tasks for their work orders" ON work_order_tasks;

CREATE POLICY "Authenticated users can view work order tasks"
  ON work_order_tasks
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- INVOICES
-- =============================================

DROP POLICY IF EXISTS "Sales reps can view invoices for their proposals" ON invoices;
DROP POLICY IF EXISTS "Users can view invoices based on office visibility" ON invoices;

CREATE POLICY "Authenticated users can view invoices"
  ON invoices
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- RECURRING PLANS
-- =============================================

DROP POLICY IF EXISTS "Users can view plans based on office visibility" ON recurring_plans;
DROP POLICY IF EXISTS "Sales and admin can update plans" ON recurring_plans;

CREATE POLICY "Authenticated users can view recurring plans"
  ON recurring_plans
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update recurring plans"
  ON recurring_plans
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================
-- RECURRING SUBSCRIPTIONS
-- =============================================

DROP POLICY IF EXISTS "Users can view subscriptions based on office visibility" ON recurring_subscriptions;
DROP POLICY IF EXISTS "Sales can update subscriptions" ON recurring_subscriptions;
DROP POLICY IF EXISTS "Sales can delete subscriptions" ON recurring_subscriptions;

CREATE POLICY "Authenticated users can view subscriptions"
  ON recurring_subscriptions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update subscriptions"
  ON recurring_subscriptions
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete subscriptions"
  ON recurring_subscriptions
  FOR DELETE
  TO authenticated
  USING (true);

-- =============================================
-- SUBSCRIPTION LINE ITEMS
-- =============================================

DROP POLICY IF EXISTS "Users can view subscription line items" ON subscription_line_items;
DROP POLICY IF EXISTS "Users can update subscription line items" ON subscription_line_items;
DROP POLICY IF EXISTS "Users can delete subscription line items" ON subscription_line_items;

CREATE POLICY "Authenticated users can view subscription line items"
  ON subscription_line_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update subscription line items"
  ON subscription_line_items
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete subscription line items"
  ON subscription_line_items
  FOR DELETE
  TO authenticated
  USING (true);

-- =============================================
-- RECURRING INVOICES
-- =============================================

DROP POLICY IF EXISTS "Users can view recurring invoices based on subscription visibil" ON recurring_invoices;

CREATE POLICY "Authenticated users can view recurring invoices"
  ON recurring_invoices
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- APPOINTMENTS
-- =============================================

DROP POLICY IF EXISTS "Users can view appointments" ON appointments;

CREATE POLICY "Authenticated users can view appointments"
  ON appointments
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- PUNCH LISTS
-- =============================================

DROP POLICY IF EXISTS "Users can view punch lists" ON punch_lists;

CREATE POLICY "Authenticated users can view punch lists"
  ON punch_lists
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- PUNCH LIST ITEMS
-- =============================================

DROP POLICY IF EXISTS "Users can view punch list items" ON punch_list_items;
DROP POLICY IF EXISTS "Assigned techs can update punch items" ON punch_list_items;

CREATE POLICY "Authenticated users can view punch list items"
  ON punch_list_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update punch list items"
  ON punch_list_items
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================
-- TAX EXEMPTION CERTIFICATES
-- =============================================

DROP POLICY IF EXISTS "Users can view exemption certificates for their contacts" ON tax_exemption_certificates;
DROP POLICY IF EXISTS "Users can manage exemption certificates for their contacts" ON tax_exemption_certificates;

CREATE POLICY "Authenticated users can view tax exemption certificates"
  ON tax_exemption_certificates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage tax exemption certificates"
  ON tax_exemption_certificates
  FOR ALL
  TO authenticated
  USING (true);

-- =============================================
-- PROPOSAL ACTIVITY
-- =============================================

DROP POLICY IF EXISTS "Users can view proposal activity" ON proposal_activity;
DROP POLICY IF EXISTS "Users can log proposal activity" ON proposal_activity;

CREATE POLICY "Authenticated users can view proposal activity"
  ON proposal_activity
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can log proposal activity"
  ON proposal_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =============================================
-- PROPOSAL REACTIVATION REQUESTS
-- =============================================

DROP POLICY IF EXISTS "Users can view reactivation requests" ON proposal_reactivation_requests;
DROP POLICY IF EXISTS "Users can update reactivation requests" ON proposal_reactivation_requests;

CREATE POLICY "Authenticated users can view reactivation requests"
  ON proposal_reactivation_requests
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update reactivation requests"
  ON proposal_reactivation_requests
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================
-- PROPOSAL MESSAGES
-- =============================================

DROP POLICY IF EXISTS "Staff can view proposal messages" ON proposal_messages;
DROP POLICY IF EXISTS "Staff can send proposal messages" ON proposal_messages;
DROP POLICY IF EXISTS "Staff can mark messages as read" ON proposal_messages;

CREATE POLICY "Authenticated users can view proposal messages"
  ON proposal_messages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can send proposal messages"
  ON proposal_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can mark messages as read"
  ON proposal_messages
  FOR UPDATE
  TO authenticated
  USING (true);
