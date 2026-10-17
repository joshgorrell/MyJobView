/*\n  # Replace remaining legacy RLS policies - Part B2\n  \n  Create org-scoped policies for 40 tables that don't yet have them,\n  then drop their legacy non-org-scoped policies.\n\n  ## Tables affected\n  bug_notification_settings, company_messages, competitors, control4_projects,\n  crew_assignments, invoice_change_order_links, invoice_line_item_sources,\n  issue_reports, job_completion_templates, job_completions, office_travel_settings,\n  payment_methods, points_transactions, product_classes, product_request_items,\n  product_requests, product_subcategories, project_tasks, proposal_archive_log,\n  proposal_line_item_labor_phases, proposal_notifications, proposal_report_templates,\n  prospect_competitor_relationships, pto_accrual_history, pto_balances, pto_policies,\n  pto_requests, quickbooks_settings, quickbooks_synced_customers, reward_redemptions,\n  rewards_catalog, scheduled_connections, scheduled_connection_occurrences,\n  security_contract_cancellations, serial_lot_tracking, sms_logs, sticky_notes,\n  subscription_cancellations, task_watchers, travel_bonus_requests, travel_logs,\n  vip_program_tracking, warehouse_bins, work_order_task_completions\n\n  ## Security\n  - All new policies use organization_id = get_user_org_id() for tenant isolation\n  - Portal/anonymous policies preserved where needed\n*/\n\n-- ==================== bug_notification_settings ====================\nDROP POLICY IF EXISTS "Admins can delete bug notification settings" ON bug_notification_settings

\nDROP POLICY IF EXISTS "Admins can insert bug notification settings" ON bug_notification_settings

\nDROP POLICY IF EXISTS "Admins can update bug notification settings" ON bug_notification_settings

\nDROP POLICY IF EXISTS "Admins can view bug notification settings" ON bug_notification_settings

\n\nCREATE POLICY "bug_notification_settings_select_same_org" ON bug_notification_settings\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "bug_notification_settings_insert_same_org" ON bug_notification_settings\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "bug_notification_settings_update_same_org" ON bug_notification_settings\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "bug_notification_settings_delete_same_org" ON bug_notification_settings\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== company_messages ====================\nDROP POLICY IF EXISTS "Admins can delete messages" ON company_messages

\nDROP POLICY IF EXISTS "Admins can insert messages" ON company_messages

\nDROP POLICY IF EXISTS "Admins can update messages" ON company_messages

\nDROP POLICY IF EXISTS "Admins can view all messages" ON company_messages

\nDROP POLICY IF EXISTS "All authenticated users can view active messages" ON company_messages

\n\nCREATE POLICY "company_messages_select_same_org" ON company_messages\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "company_messages_insert_same_org" ON company_messages\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "company_messages_update_same_org" ON company_messages\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "company_messages_delete_same_org" ON company_messages\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== competitors ====================\nDROP POLICY IF EXISTS "Users with prospect permission can delete competitors" ON competitors

\nDROP POLICY IF EXISTS "Users with prospect permission can insert competitors" ON competitors

\nDROP POLICY IF EXISTS "Users with prospect permission can update competitors" ON competitors

\nDROP POLICY IF EXISTS "Users with prospect permission can view competitors" ON competitors

\n\nCREATE POLICY "competitors_select_same_org" ON competitors\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "competitors_insert_same_org" ON competitors\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "competitors_update_same_org" ON competitors\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "competitors_delete_same_org" ON competitors\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== control4_projects ====================\nDROP POLICY IF EXISTS "Users can manage control4 projects" ON control4_projects

\nDROP POLICY IF EXISTS "Users can view control4 projects" ON control4_projects

\n\nCREATE POLICY "control4_projects_select_same_org" ON control4_projects\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "control4_projects_insert_same_org" ON control4_projects\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "control4_projects_update_same_org" ON control4_projects\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "control4_projects_delete_same_org" ON control4_projects\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== crew_assignments ====================\nDROP POLICY IF EXISTS "Dispatchers can manage crew assignments" ON crew_assignments

\nDROP POLICY IF EXISTS "Users can view relevant crew assignments" ON crew_assignments

\n\nCREATE POLICY "crew_assignments_select_same_org" ON crew_assignments\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "crew_assignments_insert_same_org" ON crew_assignments\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "crew_assignments_update_same_org" ON crew_assignments\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "crew_assignments_delete_same_org" ON crew_assignments\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== invoice_change_order_links ====================\nDROP POLICY IF EXISTS "Staff can create invoice change order links in their company" ON invoice_change_order_links

\nDROP POLICY IF EXISTS "Staff can delete invoice change order links in their company" ON invoice_change_order_links

\nDROP POLICY IF EXISTS "Staff can update invoice change order links in their company" ON invoice_change_order_links

\nDROP POLICY IF EXISTS "Staff can view invoice change order links in their company" ON invoice_change_order_links

\n\nCREATE POLICY "invoice_change_order_links_select_same_org" ON invoice_change_order_links\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "invoice_change_order_links_insert_same_org" ON invoice_change_order_links\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "invoice_change_order_links_update_same_org" ON invoice_change_order_links\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "invoice_change_order_links_delete_same_org" ON invoice_change_order_links\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== invoice_line_item_sources ====================\nDROP POLICY IF EXISTS "Staff can create invoice line item sources in their company" ON invoice_line_item_sources

\nDROP POLICY IF EXISTS "Staff can delete invoice line item sources in their company" ON invoice_line_item_sources

\nDROP POLICY IF EXISTS "Staff can update invoice line item sources in their company" ON invoice_line_item_sources

\nDROP POLICY IF EXISTS "Staff can view invoice line item sources in their company" ON invoice_line_item_sources

\n\nCREATE POLICY "invoice_line_item_sources_select_same_org" ON invoice_line_item_sources\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "invoice_line_item_sources_insert_same_org" ON invoice_line_item_sources\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "invoice_line_item_sources_update_same_org" ON invoice_line_item_sources\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "invoice_line_item_sources_delete_same_org" ON invoice_line_item_sources\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== issue_reports ====================\nDROP POLICY IF EXISTS "Admins can update all issues" ON issue_reports

\nDROP POLICY IF EXISTS "Admins can view all issues" ON issue_reports

\nDROP POLICY IF EXISTS "Users can create issues" ON issue_reports

\nDROP POLICY IF EXISTS "Users can update own open issues" ON issue_reports

\nDROP POLICY IF EXISTS "Users can view own issues" ON issue_reports

\n\nCREATE POLICY "issue_reports_select_same_org" ON issue_reports\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "issue_reports_insert_same_org" ON issue_reports\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "issue_reports_update_same_org" ON issue_reports\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "issue_reports_delete_same_org" ON issue_reports\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== job_completion_templates ====================\nDROP POLICY IF EXISTS "Admins can manage templates" ON job_completion_templates

\nDROP POLICY IF EXISTS "Everyone can view active templates" ON job_completion_templates

\n\nCREATE POLICY "job_completion_templates_select_same_org" ON job_completion_templates\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "job_completion_templates_insert_same_org" ON job_completion_templates\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "job_completion_templates_update_same_org" ON job_completion_templates\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "job_completion_templates_delete_same_org" ON job_completion_templates\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== job_completions ====================\nDROP POLICY IF EXISTS "Admins can update job completions" ON job_completions

\nDROP POLICY IF EXISTS "Techs can create job completions" ON job_completions

\nDROP POLICY IF EXISTS "Techs can view own job completions" ON job_completions

\n\nCREATE POLICY "job_completions_select_same_org" ON job_completions\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "job_completions_insert_same_org" ON job_completions\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "job_completions_update_same_org" ON job_completions\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "job_completions_delete_same_org" ON job_completions\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== office_travel_settings ====================\nDROP POLICY IF EXISTS "Admins can insert travel settings" ON office_travel_settings

\nDROP POLICY IF EXISTS "Admins can update travel settings" ON office_travel_settings

\nDROP POLICY IF EXISTS "Admins can view travel settings" ON office_travel_settings

\n\nCREATE POLICY "office_travel_settings_select_same_org" ON office_travel_settings\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "office_travel_settings_insert_same_org" ON office_travel_settings\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "office_travel_settings_update_same_org" ON office_travel_settings\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "office_travel_settings_delete_same_org" ON office_travel_settings\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== payment_methods ====================\nDROP POLICY IF EXISTS "Admin can view all payment methods" ON payment_methods

\nDROP POLICY IF EXISTS "Users can manage own payment methods" ON payment_methods

\n-- Keep: "Anonymous users can create payment methods for VIP signup" (anonymous)\n\nCREATE POLICY "payment_methods_select_same_org" ON payment_methods\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "payment_methods_insert_same_org" ON payment_methods\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "payment_methods_update_same_org" ON payment_methods\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "payment_methods_delete_same_org" ON payment_methods\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== points_transactions ====================\nDROP POLICY IF EXISTS "Admins can create transactions" ON points_transactions

\nDROP POLICY IF EXISTS "Admins can view all transactions" ON points_transactions

\nDROP POLICY IF EXISTS "Users can view own transactions" ON points_transactions

\n\nCREATE POLICY "points_transactions_select_same_org" ON points_transactions\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "points_transactions_insert_same_org" ON points_transactions\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "points_transactions_update_same_org" ON points_transactions\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "points_transactions_delete_same_org" ON points_transactions\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== product_classes ====================\nDROP POLICY IF EXISTS "Admins can manage product classes" ON product_classes

\nDROP POLICY IF EXISTS "Users can view active product classes" ON product_classes

\n\nCREATE POLICY "product_classes_select_same_org" ON product_classes\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "product_classes_insert_same_org" ON product_classes\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_classes_update_same_org" ON product_classes\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_classes_delete_same_org" ON product_classes\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== product_request_items ====================\nDROP POLICY IF EXISTS "Managers can manage product request items" ON product_request_items

\nDROP POLICY IF EXISTS "Users can create product request items" ON product_request_items

\nDROP POLICY IF EXISTS "Users can view product request items" ON product_request_items

\n\nCREATE POLICY "product_request_items_select_same_org" ON product_request_items\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "product_request_items_insert_same_org" ON product_request_items\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_request_items_update_same_org" ON product_request_items\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_request_items_delete_same_org" ON product_request_items\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== product_requests ====================\nDROP POLICY IF EXISTS "Managers can manage product requests" ON product_requests

\nDROP POLICY IF EXISTS "Users can create product requests" ON product_requests

\nDROP POLICY IF EXISTS "Users can update own product requests" ON product_requests

\nDROP POLICY IF EXISTS "Users can view own product requests" ON product_requests

\n\nCREATE POLICY "product_requests_select_same_org" ON product_requests\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "product_requests_insert_same_org" ON product_requests\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_requests_update_same_org" ON product_requests\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_requests_delete_same_org" ON product_requests\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== product_subcategories ====================\nDROP POLICY IF EXISTS "Admins can manage subcategories" ON product_subcategories

\nDROP POLICY IF EXISTS "Anyone can view active subcategories" ON product_subcategories

\n\nCREATE POLICY "product_subcategories_select_same_org" ON product_subcategories\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "product_subcategories_insert_same_org" ON product_subcategories\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_subcategories_update_same_org" ON product_subcategories\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_subcategories_delete_same_org" ON product_subcategories\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== project_tasks ====================\nDROP POLICY IF EXISTS "Managers can create project tasks" ON project_tasks

\nDROP POLICY IF EXISTS "Managers can delete project tasks" ON project_tasks

\nDROP POLICY IF EXISTS "Managers can update project tasks" ON project_tasks

\nDROP POLICY IF EXISTS "Users can view project tasks" ON project_tasks

\n\nCREATE POLICY "project_tasks_select_same_org" ON project_tasks\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "project_tasks_insert_same_org" ON project_tasks\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "project_tasks_update_same_org" ON project_tasks\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "project_tasks_delete_same_org" ON project_tasks\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n
