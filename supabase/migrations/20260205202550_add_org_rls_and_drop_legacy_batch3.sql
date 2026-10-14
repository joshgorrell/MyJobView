/*\n  # Add Org-Scoped RLS + Drop Legacy Policies - Batch 3\n\n  1. Changes\n    - Remaining tables: punchlist, warehouse/stock, work order children,\n      change orders, points/rewards, config tables, misc\n\n  2. Affected Tables\n    - punchlist_tasks, punchlist_access_grants, punchlist_task_history, punchlist_task_photos\n    - pending_punchlist_invites, punch_lists, punch_list_items\n    - warehouses, stock_movements, stock_adjustments, stock_adjustment_items\n    - stock_transfers, stock_transfer_items, stock_reservations\n    - purchase_orders, purchase_order_items\n    - work_order_tasks, work_order_materials\n    - change_orders, change_order_line_items, change_order_approvals, change_order_documents, change_order_history\n    - points_history, points_configuration, user_points\n    - manufacturers, vendors, contracts\n    - department_modules, department_role_access, default_starred_modules\n    - module_role_access, role_department_access, role_module_access\n    - discussion_post_bumps, discussion_post_likes\n    - pipeline_stages, priority_settings\n    - portal_io_cache, quickbooks_staged_customers, quickbooks_sync_logs\n    - signup_attempts, pending_payments\n    - push_subscriptions, tax_exemption_certificates, tax_jurisdictions\n    - monitoring_services, labor_phases, product_categories\n\n  3. Security\n    - All access scoped by organization_id = get_user_org_id()\n*/\n\n-- =============================================\n-- PUNCHLIST TASKS\n-- =============================================\nDROP POLICY IF EXISTS "All authenticated users can view punchlist tasks" ON punchlist_tasks

\nDROP POLICY IF EXISTS "Staff can view all punchlist tasks" ON punchlist_tasks

\nDROP POLICY IF EXISTS "Staff can create punchlist tasks for customers" ON punchlist_tasks

\nDROP POLICY IF EXISTS "Staff can update punchlist tasks" ON punchlist_tasks

\nDROP POLICY IF EXISTS "Staff can delete punchlist tasks" ON punchlist_tasks

\n-- Keep portal user policies\n\nCREATE POLICY "punchlist_tasks_select_same_org" ON punchlist_tasks FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "punchlist_tasks_insert_same_org" ON punchlist_tasks FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "punchlist_tasks_update_same_org" ON punchlist_tasks FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "punchlist_tasks_delete_same_org" ON punchlist_tasks FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PUNCHLIST ACCESS GRANTS\n-- =============================================\nDROP POLICY IF EXISTS "All authenticated users can view punchlist access grants" ON punchlist_access_grants

\nDROP POLICY IF EXISTS "Staff can view punchlist access grants" ON punchlist_access_grants

\nDROP POLICY IF EXISTS "Staff can create punchlist access grants" ON punchlist_access_grants

\nDROP POLICY IF EXISTS "Staff can update punchlist access grants" ON punchlist_access_grants

\n-- Keep portal policy\n\nCREATE POLICY "punchlist_access_grants_select_same_org" ON punchlist_access_grants FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "punchlist_access_grants_insert_same_org" ON punchlist_access_grants FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "punchlist_access_grants_update_same_org" ON punchlist_access_grants FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PUNCHLIST TASK HISTORY + PHOTOS\n-- =============================================\nDROP POLICY IF EXISTS "All authenticated users can view punchlist task history" ON punchlist_task_history

\nDROP POLICY IF EXISTS "All authenticated users can view punchlist task photos" ON punchlist_task_photos

\nDROP POLICY IF EXISTS "All authenticated users can delete punchlist task photos" ON punchlist_task_photos

\n\nCREATE POLICY "punchlist_task_history_select_same_org" ON punchlist_task_history FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "punchlist_task_photos_select_same_org" ON punchlist_task_photos FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "punchlist_task_photos_insert_same_org" ON punchlist_task_photos FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "punchlist_task_photos_delete_same_org" ON punchlist_task_photos FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PENDING PUNCHLIST INVITES\n-- =============================================\nDROP POLICY IF EXISTS "All authenticated users can view pending punchlist invites" ON pending_punchlist_invites

\n\nCREATE POLICY "pending_punchlist_invites_select_same_org" ON pending_punchlist_invites FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "pending_punchlist_invites_insert_same_org" ON pending_punchlist_invites FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "pending_punchlist_invites_update_same_org" ON pending_punchlist_invites FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "pending_punchlist_invites_delete_same_org" ON pending_punchlist_invites FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PUNCH LISTS + ITEMS (legacy tables)\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view punch lists" ON punch_lists

\nDROP POLICY IF EXISTS "Authenticated users can view punch list items" ON punch_list_items

\nDROP POLICY IF EXISTS "Authenticated users can update punch list items" ON punch_list_items

\n\nCREATE POLICY "punch_lists_select_same_org" ON punch_lists FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "punch_list_items_select_same_org" ON punch_list_items FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "punch_list_items_update_same_org" ON punch_list_items FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- WAREHOUSES + STOCK\n-- =============================================\nDROP POLICY IF EXISTS "Users can view warehouses" ON warehouses

\nDROP POLICY IF EXISTS "Users can view stock movements" ON stock_movements

\nDROP POLICY IF EXISTS "Users can view adjustments" ON stock_adjustments

\nDROP POLICY IF EXISTS "Users can view adjustment items" ON stock_adjustment_items

\nDROP POLICY IF EXISTS "Users can view transfers" ON stock_transfers

\nDROP POLICY IF EXISTS "Users can view transfer items" ON stock_transfer_items

\nDROP POLICY IF EXISTS "Users can view stock reservations" ON stock_reservations

\nDROP POLICY IF EXISTS "Users can view purchase orders" ON purchase_orders

\nDROP POLICY IF EXISTS "Users can view PO items" ON purchase_order_items

\n\nCREATE POLICY "warehouses_select_same_org" ON warehouses FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "warehouses_insert_same_org" ON warehouses FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "warehouses_update_same_org" ON warehouses FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "stock_movements_select_same_org" ON stock_movements FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "stock_movements_insert_same_org" ON stock_movements FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "stock_adjustments_select_same_org" ON stock_adjustments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "stock_adjustments_insert_same_org" ON stock_adjustments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "stock_adjustment_items_select_same_org" ON stock_adjustment_items FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "stock_adjustment_items_insert_same_org" ON stock_adjustment_items FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "stock_transfers_select_same_org" ON stock_transfers FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "stock_transfers_insert_same_org" ON stock_transfers FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "stock_transfers_update_same_org" ON stock_transfers FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "stock_transfer_items_select_same_org" ON stock_transfer_items FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "stock_transfer_items_insert_same_org" ON stock_transfer_items FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "stock_reservations_select_same_org" ON stock_reservations FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "stock_reservations_insert_same_org" ON stock_reservations FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "stock_reservations_update_same_org" ON stock_reservations FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "stock_reservations_delete_same_org" ON stock_reservations FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "purchase_orders_select_same_org" ON purchase_orders FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "purchase_orders_insert_same_org" ON purchase_orders FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "purchase_orders_update_same_org" ON purchase_orders FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "purchase_order_items_select_same_org" ON purchase_order_items FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "purchase_order_items_insert_same_org" ON purchase_order_items FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "purchase_order_items_update_same_org" ON purchase_order_items FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- WORK ORDER TASKS + MATERIALS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view work order tasks" ON work_order_tasks

\nDROP POLICY IF EXISTS "Managers can manage work order tasks" ON work_order_tasks

\nDROP POLICY IF EXISTS "Technicians can update their work order tasks" ON work_order_tasks

\nDROP POLICY IF EXISTS "Users can view work order tasks" ON work_order_tasks

\nDROP POLICY IF EXISTS "Authenticated users can view work order materials" ON work_order_materials

\nDROP POLICY IF EXISTS "Authenticated users can manage work order materials" ON work_order_materials

\n\nCREATE POLICY "work_order_tasks_select_same_org" ON work_order_tasks FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "work_order_tasks_insert_same_org" ON work_order_tasks FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "work_order_tasks_update_same_org" ON work_order_tasks FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "work_order_tasks_delete_same_org" ON work_order_tasks FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "work_order_materials_select_same_org" ON work_order_materials FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "work_order_materials_insert_same_org" ON work_order_materials FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "work_order_materials_update_same_org" ON work_order_materials FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "work_order_materials_delete_same_org" ON work_order_materials FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- CHANGE ORDERS + CHILDREN\n-- =============================================\nDROP POLICY IF EXISTS "Users can view change orders in their scope" ON change_orders

\nDROP POLICY IF EXISTS "Managers can create change orders" ON change_orders

\nDROP POLICY IF EXISTS "Managers and requesters can update their change orders" ON change_orders

\nDROP POLICY IF EXISTS "Managers can delete draft change orders" ON change_orders

\n\nCREATE POLICY "change_orders_select_same_org" ON change_orders FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "change_orders_insert_same_org" ON change_orders FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "change_orders_update_same_org" ON change_orders FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "change_orders_delete_same_org" ON change_orders FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view line items for change orders they can see" ON change_order_line_items

\nDROP POLICY IF EXISTS "Managers can manage change order line items" ON change_order_line_items

\n\nCREATE POLICY "change_order_line_items_select_same_org" ON change_order_line_items FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "change_order_line_items_insert_same_org" ON change_order_line_items FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "change_order_line_items_update_same_org" ON change_order_line_items FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "change_order_line_items_delete_same_org" ON change_order_line_items FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view approvals for change orders they can see" ON change_order_approvals

\nCREATE POLICY "change_order_approvals_select_same_org" ON change_order_approvals FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "change_order_approvals_insert_same_org" ON change_order_approvals FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view documents for change orders they can see" ON change_order_documents

\nCREATE POLICY "change_order_documents_select_same_org" ON change_order_documents FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "change_order_documents_insert_same_org" ON change_order_documents FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view history for change orders they can see" ON change_order_history

\nCREATE POLICY "change_order_history_select_same_org" ON change_order_history FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "change_order_history_insert_same_org" ON change_order_history FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- POINTS / REWARDS\n-- =============================================\nDROP POLICY IF EXISTS "Users can view all points history" ON points_history

\nDROP POLICY IF EXISTS "Users can view points configuration" ON points_configuration

\nDROP POLICY IF EXISTS "All authenticated users can view user points" ON user_points

\nDROP POLICY IF EXISTS "System can update user points" ON user_points

\n\nCREATE POLICY "points_history_select_same_org" ON points_history FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "points_history_insert_same_org" ON points_history FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "points_configuration_select_same_org" ON points_configuration FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "points_configuration_insert_same_org" ON points_configuration FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "points_configuration_update_same_org" ON points_configuration FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "user_points_select_same_org" ON user_points FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "user_points_insert_same_org" ON user_points FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "user_points_update_same_org" ON user_points FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- MANUFACTURERS + VENDORS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can manage manufacturers" ON manufacturers

\nDROP POLICY IF EXISTS "Users can view vendors" ON vendors

\n\nCREATE POLICY "manufacturers_select_same_org" ON manufacturers FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "manufacturers_insert_same_org" ON manufacturers FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "manufacturers_update_same_org" ON manufacturers FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "manufacturers_delete_same_org" ON manufacturers FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "vendors_select_same_org" ON vendors FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "vendors_insert_same_org" ON vendors FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "vendors_update_same_org" ON vendors FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "vendors_delete_same_org" ON vendors FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- CONTRACTS\n-- =============================================\nDROP POLICY IF EXISTS "All authenticated users can view contracts" ON contracts

\n\nCREATE POLICY "contracts_select_same_org" ON contracts FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "contracts_insert_same_org" ON contracts FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "contracts_update_same_org" ON contracts FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- DEPARTMENT/MODULE CONFIGURATION\n-- =============================================\nDROP POLICY IF EXISTS "Anyone can view modules" ON department_modules

\nCREATE POLICY "department_modules_select_same_org" ON department_modules FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "department_modules_insert_same_org" ON department_modules FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "department_modules_update_same_org" ON department_modules FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nDROP POLICY IF EXISTS "Only admins can manage modules" ON department_modules

\n\nDROP POLICY IF EXISTS "Anyone can view department role access" ON department_role_access

\nCREATE POLICY "department_role_access_select_same_org" ON department_role_access FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Anyone can view default starred modules" ON default_starred_modules

\nCREATE POLICY "default_starred_modules_select_same_org" ON default_starred_modules FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "default_starred_modules_insert_same_org" ON default_starred_modules FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Anyone can view module role access" ON module_role_access

\nCREATE POLICY "module_role_access_select_same_org" ON module_role_access FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view role department access" ON role_department_access

\nCREATE POLICY "role_department_access_select_same_org" ON role_department_access FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view role module access" ON role_module_access

\nCREATE POLICY "role_module_access_select_same_org" ON role_module_access FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- DISCUSSION POST BUMPS + LIKES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view bump history" ON discussion_post_bumps

\nCREATE POLICY "discussion_post_bumps_select_same_org" ON discussion_post_bumps FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "discussion_post_bumps_insert_same_org" ON discussion_post_bumps FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Anyone can view likes" ON discussion_post_likes

\nCREATE POLICY "discussion_post_likes_select_same_org" ON discussion_post_likes FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "discussion_post_likes_insert_same_org" ON discussion_post_likes FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "discussion_post_likes_delete_same_org" ON discussion_post_likes FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- MISC CONFIG TABLES\n-- =============================================\nDROP POLICY IF EXISTS "Anyone can view pipeline stages" ON pipeline_stages

\nCREATE POLICY "pipeline_stages_select_same_org" ON pipeline_stages FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "All users can view priority settings" ON priority_settings

\nCREATE POLICY "priority_settings_select_same_org" ON priority_settings FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view portal.io cache" ON portal_io_cache

\nCREATE POLICY "portal_io_cache_select_same_org" ON portal_io_cache FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "portal_io_cache_insert_same_org" ON portal_io_cache FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "All authenticated users can view staged customers" ON quickbooks_staged_customers

\nDROP POLICY IF EXISTS "System can manage staged customers" ON quickbooks_staged_customers

\nCREATE POLICY "quickbooks_staged_customers_select_same_org" ON quickbooks_staged_customers FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "quickbooks_staged_customers_insert_same_org" ON quickbooks_staged_customers FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "quickbooks_staged_customers_update_same_org" ON quickbooks_staged_customers FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "quickbooks_staged_customers_delete_same_org" ON quickbooks_staged_customers FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "All authenticated users can view sync logs" ON quickbooks_sync_logs

\nCREATE POLICY "quickbooks_sync_logs_select_same_org" ON quickbooks_sync_logs FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "quickbooks_sync_logs_insert_same_org" ON quickbooks_sync_logs FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Authenticated can update signup attempts" ON signup_attempts

\nCREATE POLICY "signup_attempts_select_same_org" ON signup_attempts FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "signup_attempts_insert_same_org" ON signup_attempts FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "signup_attempts_update_same_org" ON signup_attempts FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "System can update pending payments" ON pending_payments

\nCREATE POLICY "pending_payments_select_same_org" ON pending_payments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "pending_payments_insert_same_org" ON pending_payments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "pending_payments_update_same_org" ON pending_payments FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PUSH SUBSCRIPTIONS\n-- =============================================\nDROP POLICY IF EXISTS "Service role can access all push subscriptions" ON push_subscriptions

\nDROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON push_subscriptions

\n\nCREATE POLICY "push_subscriptions_select_same_org" ON push_subscriptions FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())

\nCREATE POLICY "push_subscriptions_insert_same_org" ON push_subscriptions FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id() AND user_id = auth.uid())

\nCREATE POLICY "push_subscriptions_update_same_org" ON push_subscriptions FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "push_subscriptions_delete_same_org" ON push_subscriptions FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())

\n\n-- =============================================\n-- TAX TABLES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view tax exemption certificates" ON tax_exemption_certificates

\nDROP POLICY IF EXISTS "Authenticated users can manage tax exemption certificates" ON tax_exemption_certificates

\n\nCREATE POLICY "tax_exemption_certificates_select_same_org" ON tax_exemption_certificates FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "tax_exemption_certificates_insert_same_org" ON tax_exemption_certificates FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "tax_exemption_certificates_update_same_org" ON tax_exemption_certificates FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "tax_exemption_certificates_delete_same_org" ON tax_exemption_certificates FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "All authenticated users can view tax jurisdictions" ON tax_jurisdictions

\nCREATE POLICY "tax_jurisdictions_select_same_org" ON tax_jurisdictions FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- MONITORING SERVICES\n-- =============================================\nDROP POLICY IF EXISTS "Anyone can view active monitoring services" ON monitoring_services

\nDROP POLICY IF EXISTS "Admins can manage monitoring services" ON monitoring_services

\n\nCREATE POLICY "monitoring_services_select_same_org" ON monitoring_services FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "monitoring_services_insert_same_org" ON monitoring_services FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "monitoring_services_update_same_org" ON monitoring_services FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "monitoring_services_delete_same_org" ON monitoring_services FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- LABOR PHASES\n-- =============================================\nDROP POLICY IF EXISTS "All users can view active labor phases" ON labor_phases

\nDROP POLICY IF EXISTS "Admins can manage labor phases" ON labor_phases

\n\nCREATE POLICY "labor_phases_select_same_org" ON labor_phases FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "labor_phases_insert_same_org" ON labor_phases FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "labor_phases_update_same_org" ON labor_phases FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "labor_phases_delete_same_org" ON labor_phases FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PRODUCT CATEGORIES\n-- =============================================\nDROP POLICY IF EXISTS "Anyone can view active categories" ON product_categories

\nDROP POLICY IF EXISTS "Admins can manage categories" ON product_categories

\n\nCREATE POLICY "product_categories_select_same_org" ON product_categories FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "product_categories_insert_same_org" ON product_categories FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_categories_update_same_org" ON product_categories FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_categories_delete_same_org" ON product_categories FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PRIORITY LEVELS\n-- =============================================\nDROP POLICY IF EXISTS "Users can view active priority levels" ON priority_levels

\nDROP POLICY IF EXISTS "Admins can manage priority levels" ON priority_levels

\n\nCREATE POLICY "priority_levels_select_same_org" ON priority_levels FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "priority_levels_insert_same_org" ON priority_levels FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "priority_levels_update_same_org" ON priority_levels FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "priority_levels_delete_same_org" ON priority_levels FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n
