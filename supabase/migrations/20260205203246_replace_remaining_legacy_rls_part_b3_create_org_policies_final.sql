/*\n  # Replace remaining legacy RLS policies - Part B3 (Final)\n  \n  Create org-scoped policies for the final batch of tables that don't yet have them,\n  then drop their legacy non-org-scoped policies.\n\n  ## Tables affected\n  proposal_archive_log, proposal_line_item_labor_phases, proposal_notifications,\n  proposal_report_templates, prospect_competitor_relationships, pto_accrual_history,\n  pto_balances, pto_policies, pto_requests, quickbooks_settings, quickbooks_synced_customers,\n  reward_redemptions, rewards_catalog, scheduled_connections, scheduled_connection_occurrences,\n  security_contract_cancellations, serial_lot_tracking, sms_logs, sticky_notes,\n  subscription_cancellations, task_watchers, travel_bonus_requests, travel_logs,\n  vip_program_tracking, warehouse_bins, work_order_task_completions\n\n  ## Security\n  - All new policies use organization_id = get_user_org_id() for tenant isolation\n  - Portal/anonymous policies preserved where needed\n*/\n\n-- ==================== proposal_archive_log ====================\nDROP POLICY IF EXISTS "Admins can view archive logs" ON proposal_archive_log

\n\nCREATE POLICY "proposal_archive_log_select_same_org" ON proposal_archive_log\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_archive_log_insert_same_org" ON proposal_archive_log\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\n\n-- ==================== proposal_line_item_labor_phases ====================\nDROP POLICY IF EXISTS "Users can delete line item labor phases" ON proposal_line_item_labor_phases

\nDROP POLICY IF EXISTS "Users can insert line item labor phases" ON proposal_line_item_labor_phases

\nDROP POLICY IF EXISTS "Users can update line item labor phases" ON proposal_line_item_labor_phases

\nDROP POLICY IF EXISTS "Users can view line item labor phases" ON proposal_line_item_labor_phases

\n\nCREATE POLICY "proposal_line_item_labor_phases_select_same_org" ON proposal_line_item_labor_phases\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_line_item_labor_phases_insert_same_org" ON proposal_line_item_labor_phases\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_line_item_labor_phases_update_same_org" ON proposal_line_item_labor_phases\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_line_item_labor_phases_delete_same_org" ON proposal_line_item_labor_phases\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== proposal_notifications ====================\nDROP POLICY IF EXISTS "Sales reps and admins can create proposal notifications" ON proposal_notifications

\nDROP POLICY IF EXISTS "Users can view proposal notifications for their company" ON proposal_notifications

\n\nCREATE POLICY "proposal_notifications_select_same_org" ON proposal_notifications\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_notifications_insert_same_org" ON proposal_notifications\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_notifications_update_same_org" ON proposal_notifications\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_notifications_delete_same_org" ON proposal_notifications\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== proposal_report_templates ====================\nDROP POLICY IF EXISTS "Users can create personal templates" ON proposal_report_templates

\nDROP POLICY IF EXISTS "Users can delete own templates" ON proposal_report_templates

\nDROP POLICY IF EXISTS "Users can update own templates" ON proposal_report_templates

\nDROP POLICY IF EXISTS "Users can view company and personal templates" ON proposal_report_templates

\n\nCREATE POLICY "proposal_report_templates_select_same_org" ON proposal_report_templates\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_report_templates_insert_same_org" ON proposal_report_templates\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_report_templates_update_same_org" ON proposal_report_templates\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_report_templates_delete_same_org" ON proposal_report_templates\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== prospect_competitor_relationships ====================\nDROP POLICY IF EXISTS "Users with prospect permission can delete relationships" ON prospect_competitor_relationships

\nDROP POLICY IF EXISTS "Users with prospect permission can insert relationships" ON prospect_competitor_relationships

\nDROP POLICY IF EXISTS "Users with prospect permission can update relationships" ON prospect_competitor_relationships

\nDROP POLICY IF EXISTS "Users with prospect permission can view relationships" ON prospect_competitor_relationships

\n\nCREATE POLICY "prospect_competitor_relationships_select_same_org" ON prospect_competitor_relationships\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "prospect_competitor_relationships_insert_same_org" ON prospect_competitor_relationships\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "prospect_competitor_relationships_update_same_org" ON prospect_competitor_relationships\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "prospect_competitor_relationships_delete_same_org" ON prospect_competitor_relationships\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== pto_accrual_history ====================\nDROP POLICY IF EXISTS "Admins can manage accrual history" ON pto_accrual_history

\nDROP POLICY IF EXISTS "Employees can view own accrual history" ON pto_accrual_history

\nDROP POLICY IF EXISTS "Managers can view all accrual history" ON pto_accrual_history

\n\nCREATE POLICY "pto_accrual_history_select_same_org" ON pto_accrual_history\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "pto_accrual_history_insert_same_org" ON pto_accrual_history\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "pto_accrual_history_update_same_org" ON pto_accrual_history\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "pto_accrual_history_delete_same_org" ON pto_accrual_history\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== pto_balances ====================\nDROP POLICY IF EXISTS "Admins can manage balances" ON pto_balances

\nDROP POLICY IF EXISTS "Employees can view own balances" ON pto_balances

\nDROP POLICY IF EXISTS "Managers can view team balances" ON pto_balances

\n\nCREATE POLICY "pto_balances_select_same_org" ON pto_balances\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "pto_balances_insert_same_org" ON pto_balances\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "pto_balances_update_same_org" ON pto_balances\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "pto_balances_delete_same_org" ON pto_balances\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== pto_policies ====================\nDROP POLICY IF EXISTS "Admins can manage policies" ON pto_policies

\nDROP POLICY IF EXISTS "Everyone can view active policies" ON pto_policies

\n\nCREATE POLICY "pto_policies_select_same_org" ON pto_policies\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "pto_policies_insert_same_org" ON pto_policies\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "pto_policies_update_same_org" ON pto_policies\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "pto_policies_delete_same_org" ON pto_policies\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== pto_requests ====================\nDROP POLICY IF EXISTS "Employees can create own requests" ON pto_requests

\nDROP POLICY IF EXISTS "Employees can update own pending requests" ON pto_requests

\nDROP POLICY IF EXISTS "Employees can view own requests" ON pto_requests

\nDROP POLICY IF EXISTS "Managers can approve requests" ON pto_requests

\nDROP POLICY IF EXISTS "Managers can view all requests" ON pto_requests

\n\nCREATE POLICY "pto_requests_select_same_org" ON pto_requests\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "pto_requests_insert_same_org" ON pto_requests\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "pto_requests_update_same_org" ON pto_requests\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "pto_requests_delete_same_org" ON pto_requests\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== quickbooks_settings ====================\nDROP POLICY IF EXISTS "Admins can delete QuickBooks settings" ON quickbooks_settings

\nDROP POLICY IF EXISTS "Admins can insert QuickBooks settings" ON quickbooks_settings

\nDROP POLICY IF EXISTS "Admins can update QuickBooks settings" ON quickbooks_settings

\nDROP POLICY IF EXISTS "Admins can view QuickBooks settings" ON quickbooks_settings

\n\nCREATE POLICY "quickbooks_settings_select_same_org" ON quickbooks_settings\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "quickbooks_settings_insert_same_org" ON quickbooks_settings\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "quickbooks_settings_update_same_org" ON quickbooks_settings\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "quickbooks_settings_delete_same_org" ON quickbooks_settings\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== quickbooks_synced_customers ====================\nDROP POLICY IF EXISTS "Admins can view synced customers" ON quickbooks_synced_customers

\n\nCREATE POLICY "quickbooks_synced_customers_select_same_org" ON quickbooks_synced_customers\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "quickbooks_synced_customers_insert_same_org" ON quickbooks_synced_customers\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "quickbooks_synced_customers_update_same_org" ON quickbooks_synced_customers\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "quickbooks_synced_customers_delete_same_org" ON quickbooks_synced_customers\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== reward_redemptions ====================\nDROP POLICY IF EXISTS "Admins can update redemptions" ON reward_redemptions

\nDROP POLICY IF EXISTS "Admins can view all redemptions" ON reward_redemptions

\nDROP POLICY IF EXISTS "Users can create redemptions" ON reward_redemptions

\nDROP POLICY IF EXISTS "Users can view own redemptions" ON reward_redemptions

\n\nCREATE POLICY "reward_redemptions_select_same_org" ON reward_redemptions\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "reward_redemptions_insert_same_org" ON reward_redemptions\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "reward_redemptions_update_same_org" ON reward_redemptions\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "reward_redemptions_delete_same_org" ON reward_redemptions\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== rewards_catalog ====================\nDROP POLICY IF EXISTS "Admins can manage rewards catalog" ON rewards_catalog

\nDROP POLICY IF EXISTS "Users can view available rewards" ON rewards_catalog

\n\nCREATE POLICY "rewards_catalog_select_same_org" ON rewards_catalog\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "rewards_catalog_insert_same_org" ON rewards_catalog\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "rewards_catalog_update_same_org" ON rewards_catalog\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "rewards_catalog_delete_same_org" ON rewards_catalog\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== scheduled_connections ====================\nDROP POLICY IF EXISTS "Sales and BD can create scheduled connections" ON scheduled_connections

\nDROP POLICY IF EXISTS "Users can delete own scheduled connections" ON scheduled_connections

\nDROP POLICY IF EXISTS "Users can update own scheduled connections" ON scheduled_connections

\nDROP POLICY IF EXISTS "Users can view own scheduled connections" ON scheduled_connections

\n\nCREATE POLICY "scheduled_connections_select_same_org" ON scheduled_connections\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "scheduled_connections_insert_same_org" ON scheduled_connections\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "scheduled_connections_update_same_org" ON scheduled_connections\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "scheduled_connections_delete_same_org" ON scheduled_connections\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== scheduled_connection_occurrences ====================\nDROP POLICY IF EXISTS "System can create occurrences" ON scheduled_connection_occurrences

\nDROP POLICY IF EXISTS "Users can delete occurrences from own schedules" ON scheduled_connection_occurrences

\nDROP POLICY IF EXISTS "Users can update occurrences from own schedules" ON scheduled_connection_occurrences

\nDROP POLICY IF EXISTS "Users can view occurrences from own schedules" ON scheduled_connection_occurrences

\n\nCREATE POLICY "scheduled_connection_occurrences_select_same_org" ON scheduled_connection_occurrences\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "scheduled_connection_occurrences_insert_same_org" ON scheduled_connection_occurrences\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "scheduled_connection_occurrences_update_same_org" ON scheduled_connection_occurrences\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "scheduled_connection_occurrences_delete_same_org" ON scheduled_connection_occurrences\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== security_contract_cancellations ====================\n-- Keep portal policies (matched by name pattern)\nDROP POLICY IF EXISTS "Staff can update cancellations" ON security_contract_cancellations

\n\nCREATE POLICY "security_contract_cancellations_select_same_org" ON security_contract_cancellations\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_cancellations_insert_same_org" ON security_contract_cancellations\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_cancellations_update_same_org" ON security_contract_cancellations\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_cancellations_delete_same_org" ON security_contract_cancellations\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== serial_lot_tracking ====================\nDROP POLICY IF EXISTS "Authorized users can manage serial tracking" ON serial_lot_tracking

\nDROP POLICY IF EXISTS "Users can view serial tracking" ON serial_lot_tracking

\n\nCREATE POLICY "serial_lot_tracking_select_same_org" ON serial_lot_tracking\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "serial_lot_tracking_insert_same_org" ON serial_lot_tracking\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "serial_lot_tracking_update_same_org" ON serial_lot_tracking\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "serial_lot_tracking_delete_same_org" ON serial_lot_tracking\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== sms_logs ====================\nDROP POLICY IF EXISTS "Users can view sms logs for their contacts" ON sms_logs

\n\nCREATE POLICY "sms_logs_select_same_org" ON sms_logs\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "sms_logs_insert_same_org" ON sms_logs\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\n\n-- ==================== sticky_notes ====================\nDROP POLICY IF EXISTS "Admins can delete any sticky note" ON sticky_notes

\nDROP POLICY IF EXISTS "Admins can update any sticky note" ON sticky_notes

\nDROP POLICY IF EXISTS "Admins can view all sticky notes" ON sticky_notes

\nDROP POLICY IF EXISTS "Users can create own sticky notes" ON sticky_notes

\nDROP POLICY IF EXISTS "Users can delete own sticky notes" ON sticky_notes

\nDROP POLICY IF EXISTS "Users can update own sticky notes" ON sticky_notes

\nDROP POLICY IF EXISTS "Users can view own sticky notes" ON sticky_notes

\n\nCREATE POLICY "sticky_notes_select_same_org" ON sticky_notes\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "sticky_notes_insert_same_org" ON sticky_notes\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "sticky_notes_update_same_org" ON sticky_notes\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "sticky_notes_delete_same_org" ON sticky_notes\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== subscription_cancellations ====================\n-- Keep portal policies (matched by name pattern)\nDROP POLICY IF EXISTS "Admin and sales can view all cancellations" ON subscription_cancellations

\n\nCREATE POLICY "subscription_cancellations_select_same_org" ON subscription_cancellations\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "subscription_cancellations_insert_same_org" ON subscription_cancellations\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "subscription_cancellations_update_same_org" ON subscription_cancellations\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "subscription_cancellations_delete_same_org" ON subscription_cancellations\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== task_watchers ====================\nDROP POLICY IF EXISTS "Users can unwatch tasks" ON task_watchers

\nDROP POLICY IF EXISTS "Users can view watchers on accessible tasks" ON task_watchers

\nDROP POLICY IF EXISTS "Users can watch tasks they can access" ON task_watchers

\n\nCREATE POLICY "task_watchers_select_same_org" ON task_watchers\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "task_watchers_insert_same_org" ON task_watchers\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "task_watchers_update_same_org" ON task_watchers\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "task_watchers_delete_same_org" ON task_watchers\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== travel_bonus_requests ====================\nDROP POLICY IF EXISTS "Admins can update travel bonus requests" ON travel_bonus_requests

\nDROP POLICY IF EXISTS "System can create travel bonus requests" ON travel_bonus_requests

\nDROP POLICY IF EXISTS "Techs can view own travel bonus requests" ON travel_bonus_requests

\n\nCREATE POLICY "travel_bonus_requests_select_same_org" ON travel_bonus_requests\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "travel_bonus_requests_insert_same_org" ON travel_bonus_requests\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "travel_bonus_requests_update_same_org" ON travel_bonus_requests\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "travel_bonus_requests_delete_same_org" ON travel_bonus_requests\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== travel_logs ====================\nDROP POLICY IF EXISTS "Managers can approve travel logs" ON travel_logs

\nDROP POLICY IF EXISTS "Managers can view all travel logs" ON travel_logs

\nDROP POLICY IF EXISTS "Technicians can create travel logs" ON travel_logs

\nDROP POLICY IF EXISTS "Technicians can view own travel logs" ON travel_logs

\n\nCREATE POLICY "travel_logs_select_same_org" ON travel_logs\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "travel_logs_insert_same_org" ON travel_logs\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "travel_logs_update_same_org" ON travel_logs\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "travel_logs_delete_same_org" ON travel_logs\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== vip_program_tracking ====================\nDROP POLICY IF EXISTS "Managers can manage VIP tracking" ON vip_program_tracking

\nDROP POLICY IF EXISTS "Users can view VIP tracking" ON vip_program_tracking

\n\nCREATE POLICY "vip_program_tracking_select_same_org" ON vip_program_tracking\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "vip_program_tracking_insert_same_org" ON vip_program_tracking\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "vip_program_tracking_update_same_org" ON vip_program_tracking\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "vip_program_tracking_delete_same_org" ON vip_program_tracking\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== warehouse_bins ====================\nDROP POLICY IF EXISTS "Admins can manage warehouse bins" ON warehouse_bins

\nDROP POLICY IF EXISTS "Users can view active warehouse bins" ON warehouse_bins

\n\nCREATE POLICY "warehouse_bins_select_same_org" ON warehouse_bins\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "warehouse_bins_insert_same_org" ON warehouse_bins\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "warehouse_bins_update_same_org" ON warehouse_bins\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "warehouse_bins_delete_same_org" ON warehouse_bins\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n\n-- ==================== work_order_task_completions ====================\nDROP POLICY IF EXISTS "Technicians can create task completions" ON work_order_task_completions

\nDROP POLICY IF EXISTS "Users can delete task completions" ON work_order_task_completions

\nDROP POLICY IF EXISTS "Users can update task completions" ON work_order_task_completions

\nDROP POLICY IF EXISTS "Users can view task completions" ON work_order_task_completions

\n\nCREATE POLICY "work_order_task_completions_select_same_org" ON work_order_task_completions\n  FOR SELECT TO authenticated USING (organization_id = get_user_org_id())

\nCREATE POLICY "work_order_task_completions_insert_same_org" ON work_order_task_completions\n  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "work_order_task_completions_update_same_org" ON work_order_task_completions\n  FOR UPDATE TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "work_order_task_completions_delete_same_org" ON work_order_task_completions\n  FOR DELETE TO authenticated USING (organization_id = get_user_org_id())

\n
