/*\n  # Rewrite RLS Policies for Tenant Isolation - Batch 2\n\n  Covers: proposals, products, projects, sales_orders, invoices, work_orders,\n  appointments, email_templates, company_offices, departments, roles,\n  recurring_plans, recurring_subscriptions, security_contracts\n*/\n\n-- PROPOSALS\nDROP POLICY IF EXISTS "proposals_select_optimized" ON proposals

\nDROP POLICY IF EXISTS "proposals_insert_optimized" ON proposals

\nDROP POLICY IF EXISTS "proposals_update_optimized" ON proposals

\nDROP POLICY IF EXISTS "proposals_delete_optimized" ON proposals

\nDROP POLICY IF EXISTS "Authenticated can read proposals" ON proposals

\nDROP POLICY IF EXISTS "Authenticated can insert proposals" ON proposals

\nDROP POLICY IF EXISTS "Authenticated can update proposals" ON proposals

\n\nCREATE POLICY "proposals_select_same_org"\n  ON proposals FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "proposals_insert_same_org"\n  ON proposals FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "proposals_update_same_org"\n  ON proposals FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "proposals_delete_same_org"\n  ON proposals FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- PRODUCTS\nDROP POLICY IF EXISTS "products_select_optimized" ON products

\nDROP POLICY IF EXISTS "products_insert" ON products

\nDROP POLICY IF EXISTS "products_update" ON products

\nDROP POLICY IF EXISTS "products_delete" ON products

\nDROP POLICY IF EXISTS "Authenticated can read products" ON products

\nDROP POLICY IF EXISTS "Authenticated can insert products" ON products

\nDROP POLICY IF EXISTS "Authenticated can update products" ON products

\n\nCREATE POLICY "products_select_same_org"\n  ON products FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "products_insert_same_org"\n  ON products FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "products_update_same_org"\n  ON products FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "products_delete_same_org"\n  ON products FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- PROJECTS\nDROP POLICY IF EXISTS "projects_select_optimized" ON projects

\nDROP POLICY IF EXISTS "projects_insert" ON projects

\nDROP POLICY IF EXISTS "projects_update" ON projects

\n\nCREATE POLICY "projects_select_same_org"\n  ON projects FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "projects_insert_same_org"\n  ON projects FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "projects_update_same_org"\n  ON projects FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- SALES_ORDERS\nDROP POLICY IF EXISTS "sales_orders_select_optimized" ON sales_orders

\nDROP POLICY IF EXISTS "sales_orders_insert" ON sales_orders

\nDROP POLICY IF EXISTS "sales_orders_update" ON sales_orders

\n\nCREATE POLICY "sales_orders_select_same_org"\n  ON sales_orders FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "sales_orders_insert_same_org"\n  ON sales_orders FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "sales_orders_update_same_org"\n  ON sales_orders FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- INVOICES\nDROP POLICY IF EXISTS "invoices_select_optimized" ON invoices

\nDROP POLICY IF EXISTS "invoices_insert" ON invoices

\nDROP POLICY IF EXISTS "invoices_update" ON invoices

\nDROP POLICY IF EXISTS "invoices_delete" ON invoices

\n\nCREATE POLICY "invoices_select_same_org"\n  ON invoices FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "invoices_insert_same_org"\n  ON invoices FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "invoices_update_same_org"\n  ON invoices FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- WORK_ORDERS\nDROP POLICY IF EXISTS "work_orders_select_optimized" ON work_orders

\nDROP POLICY IF EXISTS "work_orders_insert" ON work_orders

\nDROP POLICY IF EXISTS "work_orders_update" ON work_orders

\nDROP POLICY IF EXISTS "work_orders_delete" ON work_orders

\n\nCREATE POLICY "work_orders_select_same_org"\n  ON work_orders FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "work_orders_insert_same_org"\n  ON work_orders FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "work_orders_update_same_org"\n  ON work_orders FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "work_orders_delete_same_org"\n  ON work_orders FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- APPOINTMENTS\nDROP POLICY IF EXISTS "appointments_select_optimized" ON appointments

\nDROP POLICY IF EXISTS "appointments_insert" ON appointments

\nDROP POLICY IF EXISTS "appointments_update" ON appointments

\nDROP POLICY IF EXISTS "appointments_delete" ON appointments

\n\nCREATE POLICY "appointments_select_same_org"\n  ON appointments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "appointments_insert_same_org"\n  ON appointments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "appointments_update_same_org"\n  ON appointments FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "appointments_delete_same_org"\n  ON appointments FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- EMAIL_TEMPLATES\nDROP POLICY IF EXISTS "email_templates_select" ON email_templates

\nDROP POLICY IF EXISTS "email_templates_update" ON email_templates

\nDROP POLICY IF EXISTS "email_templates_insert" ON email_templates

\n\nCREATE POLICY "email_templates_select_same_org"\n  ON email_templates FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "email_templates_insert_same_org"\n  ON email_templates FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "email_templates_update_same_org"\n  ON email_templates FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- COMPANY_OFFICES\nDROP POLICY IF EXISTS "company_offices_select_optimized" ON company_offices

\nDROP POLICY IF EXISTS "company_offices_insert" ON company_offices

\nDROP POLICY IF EXISTS "company_offices_update" ON company_offices

\nDROP POLICY IF EXISTS "company_offices_delete" ON company_offices

\n\nCREATE POLICY "company_offices_select_same_org"\n  ON company_offices FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "company_offices_insert_same_org"\n  ON company_offices FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "company_offices_update_same_org"\n  ON company_offices FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "company_offices_delete_same_org"\n  ON company_offices FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- DEPARTMENTS\nDROP POLICY IF EXISTS "departments_select_optimized" ON departments

\nDROP POLICY IF EXISTS "departments_insert" ON departments

\nDROP POLICY IF EXISTS "departments_update" ON departments

\n\nCREATE POLICY "departments_select_same_org"\n  ON departments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "departments_insert_same_org"\n  ON departments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "departments_update_same_org"\n  ON departments FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- ROLES\nDROP POLICY IF EXISTS "roles_select" ON roles

\nDROP POLICY IF EXISTS "roles_insert" ON roles

\nDROP POLICY IF EXISTS "roles_update" ON roles

\nDROP POLICY IF EXISTS "roles_delete" ON roles

\n\nCREATE POLICY "roles_select_same_org"\n  ON roles FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "roles_insert_same_org"\n  ON roles FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "roles_update_same_org"\n  ON roles FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- RECURRING_PLANS\nDROP POLICY IF EXISTS "recurring_plans_select" ON recurring_plans

\nDROP POLICY IF EXISTS "recurring_plans_insert" ON recurring_plans

\nDROP POLICY IF EXISTS "recurring_plans_update" ON recurring_plans

\nDROP POLICY IF EXISTS "Anonymous can view public VIP plans" ON recurring_plans

\n\nCREATE POLICY "recurring_plans_select_same_org"\n  ON recurring_plans FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "recurring_plans_select_anon"\n  ON recurring_plans FOR SELECT TO anon\n  USING (true)

\n\nCREATE POLICY "recurring_plans_insert_same_org"\n  ON recurring_plans FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "recurring_plans_update_same_org"\n  ON recurring_plans FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- SECURITY_CONTRACTS\nDROP POLICY IF EXISTS "security_contracts_select" ON security_contracts

\nDROP POLICY IF EXISTS "security_contracts_insert" ON security_contracts

\nDROP POLICY IF EXISTS "security_contracts_update" ON security_contracts

\nDROP POLICY IF EXISTS "security_contracts_delete" ON security_contracts

\nDROP POLICY IF EXISTS "Authenticated can read security contracts" ON security_contracts

\nDROP POLICY IF EXISTS "Authenticated can insert security contracts" ON security_contracts

\nDROP POLICY IF EXISTS "Authenticated can update security contracts" ON security_contracts

\n\nCREATE POLICY "security_contracts_select_same_org"\n  ON security_contracts FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "security_contracts_insert_same_org"\n  ON security_contracts FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "security_contracts_update_same_org"\n  ON security_contracts FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n
