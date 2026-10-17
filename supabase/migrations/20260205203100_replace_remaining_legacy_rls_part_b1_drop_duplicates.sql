/*\n  # Replace remaining legacy RLS policies - Part B1\n  \n  Drop legacy non-org-scoped policies from tables that ALREADY have org-scoped _same_org policies.\n  These duplicate policies are a security risk because PostgreSQL's permissive RLS model\n  means ANY matching policy grants access, bypassing org isolation.\n\n  ## Tables affected (73 tables)\n  All tables listed below already have proper org-scoped policies. We are removing\n  the old role-based or permissive policies that lack organization_id checks.\n\n  ## Security impact\n  - Eliminates cross-organization data leakage vectors\n  - Preserves portal/anonymous access policies (not touched)\n  - Preserves org-scoped _same_org policies\n*/\n\n-- appointments: keep portal policy (already excluded by name pattern), drop nothing extra needed\n-- The "Portal users can view their appointments" policy is portal-scoped, will be preserved\n\n-- change_order_approvals\nDROP POLICY IF EXISTS "Approvers can update their assigned approvals" ON change_order_approvals

\nDROP POLICY IF EXISTS "Managers can create approval records" ON change_order_approvals

\n\n-- change_order_documents\nDROP POLICY IF EXISTS "Users can upload documents to change orders" ON change_order_documents

\n\n-- change_order_history\nDROP POLICY IF EXISTS "System can create history records" ON change_order_history

\n\n-- contacts: keep anonymous/portal policies (excluded by name pattern)\n-- "Anonymous users can create contacts for kiosk and VIP" - kept (anonymous)\n-- "Anonymous users can view specific contacts" - kept (anonymous)\n-- "Portal users can view their own contact" - kept (portal)\n\n-- contracts\nDROP POLICY IF EXISTS "Admins can delete contracts" ON contracts

\n\n-- discussion_post_bumps\nDROP POLICY IF EXISTS "Users can bump others' posts" ON discussion_post_bumps

\n\n-- discussion_post_likes\nDROP POLICY IF EXISTS "Users can like posts" ON discussion_post_likes

\nDROP POLICY IF EXISTS "Users can unlike posts" ON discussion_post_likes

\n\n-- invoice_line_items: keep portal policy\n-- "Portal users can view their invoice line items" - kept (portal)\n\n-- invoices: keep portal policy\n-- "Portal users can view their invoices" - kept (portal)\n\n-- job_acceptance_log\nDROP POLICY IF EXISTS "Techs can log their own acceptance actions" ON job_acceptance_log

\n\n-- job_merge_sources\nDROP POLICY IF EXISTS "Dispatchers can manage job merge sources" ON job_merge_sources

\n\n-- job_merges\nDROP POLICY IF EXISTS "Dispatchers can create job merges" ON job_merges

\n\n-- job_photo_likes\nDROP POLICY IF EXISTS "Users can like photos" ON job_photo_likes

\nDROP POLICY IF EXISTS "Users can unlike their own likes" ON job_photo_likes

\n\n-- job_split_parts\nDROP POLICY IF EXISTS "Dispatchers can manage job split parts" ON job_split_parts

\n\n-- job_splits\nDROP POLICY IF EXISTS "Dispatchers can create job splits" ON job_splits

\n\n-- job_status_history\nDROP POLICY IF EXISTS "Techs and dispatch can insert job status history" ON job_status_history

\n\n-- notifications\nDROP POLICY IF EXISTS "notifications_delete_own" ON notifications

\nDROP POLICY IF EXISTS "notifications_select_own" ON notifications

\nDROP POLICY IF EXISTS "notifications_update_own" ON notifications

\n\n-- payments: keep portal policy\n-- "Portal users can view their payments" - kept (portal)\nDROP POLICY IF EXISTS "Staff can create payments in their company" ON payments

\n\n-- pending_payments: keep portal policy\n-- "Portal users can view own pending payments" - kept (portal)\nDROP POLICY IF EXISTS "System can insert pending payments" ON pending_payments

\nDROP POLICY IF EXISTS "Users can view their pending payments" ON pending_payments

\n\n-- pending_punchlist_invites\nDROP POLICY IF EXISTS "Staff can delete pending invites" ON pending_punchlist_invites

\nDROP POLICY IF EXISTS "Staff can update pending invites" ON pending_punchlist_invites

\nDROP POLICY IF EXISTS "Staff can view pending invites" ON pending_punchlist_invites

\nDROP POLICY IF EXISTS "System can create pending invites" ON pending_punchlist_invites

\n\n-- points_configuration\nDROP POLICY IF EXISTS "Admins can manage points configuration" ON points_configuration

\n\n-- points_history\nDROP POLICY IF EXISTS "System can insert points history" ON points_history

\n\n-- priority_settings\nDROP POLICY IF EXISTS "Admins can delete priority settings" ON priority_settings

\nDROP POLICY IF EXISTS "Admins can insert priority settings" ON priority_settings

\nDROP POLICY IF EXISTS "Admins can update priority settings" ON priority_settings

\n\n-- product_inventory\nDROP POLICY IF EXISTS "Admins can manage inventory" ON product_inventory

\n\n-- product_request_settings\nDROP POLICY IF EXISTS "Admins can manage product request settings" ON product_request_settings

\n\n-- projects: keep portal policy\n-- "Portal users can view their projects" - kept (portal)\n\n-- proposal_activity\nDROP POLICY IF EXISTS "Authenticated users can log proposal activity" ON proposal_activity

\n\n-- proposal_area_templates\nDROP POLICY IF EXISTS "Sales users can manage area templates" ON proposal_area_templates

\nDROP POLICY IF EXISTS "Users can view area templates from their company" ON proposal_area_templates

\n\n-- proposal_line_items: keep portal policy\n-- "Portal users can view line items in their proposals" - kept (portal)\n\n-- proposal_messages: keep customer policy (portal-like)\n-- "Customers can send messages" - kept (portal-scoped)\n\n-- proposal_reactivation_requests: keep portal policy\n-- "Portal users can create reactivation requests" - kept (portal)\n\n-- proposal_rooms: keep portal policy  \n-- "Portal users can view rooms in their proposals" - kept (portal)\n\n-- proposals: keep portal policy\n-- "Portal users can view their proposals" - kept (portal)\n\n-- punch_lists\nDROP POLICY IF EXISTS "Managers can manage punch lists" ON punch_lists

\n\n-- punchlist_access_grants: keep portal policy\n-- "Portal users can view their own punchlist access" - kept (portal)\n\n-- punchlist_task_history\nDROP POLICY IF EXISTS "Staff can view punchlist task history" ON punchlist_task_history

\nDROP POLICY IF EXISTS "System can insert task history" ON punchlist_task_history

\n\n-- punchlist_task_photos\nDROP POLICY IF EXISTS "All authenticated users can create punchlist task photos" ON punchlist_task_photos

\nDROP POLICY IF EXISTS "Customers can add photos to own tasks" ON punchlist_task_photos

\nDROP POLICY IF EXISTS "Customers can delete own task photos" ON punchlist_task_photos

\nDROP POLICY IF EXISTS "Customers can view own task photos" ON punchlist_task_photos

\nDROP POLICY IF EXISTS "Staff can delete task photos" ON punchlist_task_photos

\nDROP POLICY IF EXISTS "Staff can view all task photos" ON punchlist_task_photos

\n\n-- punchlist_tasks: keep portal policies\n-- "Portal users can create/update/delete/view their own punchlist tasks" - kept (portal)\nDROP POLICY IF EXISTS "Customers can update own punchlist tasks" ON punchlist_tasks

\n\n-- purchase_order_items\nDROP POLICY IF EXISTS "Admins can manage PO items" ON purchase_order_items

\n\n-- purchase_orders\nDROP POLICY IF EXISTS "Admins can manage purchase orders" ON purchase_orders

\n\n-- quickbooks_sync_logs\nDROP POLICY IF EXISTS "System can insert sync logs" ON quickbooks_sync_logs

\n\n-- recurring_invoices: keep portal policy\n-- "Portal users can view their recurring invoices" - kept (portal)\nDROP POLICY IF EXISTS "System can insert recurring invoices" ON recurring_invoices

\n\n-- recurring_plans: keep anonymous/portal policies\n-- "Anonymous users can view active VIP plans" - kept (anonymous)\n-- "Portal users can view active VIP plans" - kept (portal)\n-- "Portal users can view active recurring plans" - kept (portal)\n\n-- recurring_subscriptions: keep anonymous/portal policies\n-- All portal/anonymous policies preserved\n\n-- review_requests\nDROP POLICY IF EXISTS "Users can view review requests" ON review_requests

\n\n-- roles (already has org policies)\nDROP POLICY IF EXISTS "Admins can manage roles" ON roles

\nDROP POLICY IF EXISTS "Users can view active roles" ON roles

\n\n-- security_contract_fields: keep anonymous policies\n-- "Anonymous users can insert/update/view contract fields" - kept (anonymous)\nDROP POLICY IF EXISTS "Admin and finance can manage fields" ON security_contract_fields

\n\n-- security_contract_templates: keep anonymous policy\n-- "Anonymous users can view templates" - kept (anonymous)\nDROP POLICY IF EXISTS "Admin and finance can manage templates" ON security_contract_templates

\n\n-- security_contracts: keep anonymous policies\n-- "Anonymous users can update/view contracts via magic link" - kept (anonymous)\n\n-- service_additional_charges\nDROP POLICY IF EXISTS "Authenticated users can add charges" ON service_additional_charges

\n\n-- service_billing_queue\nDROP POLICY IF EXISTS "Managers can create billing queue entries" ON service_billing_queue

\n\n-- service_labor_entries\nDROP POLICY IF EXISTS "Managers can update labor entries" ON service_labor_entries

\nDROP POLICY IF EXISTS "Techs and managers can create labor entries" ON service_labor_entries

\n\n-- service_parts_used\nDROP POLICY IF EXISTS "Techs and managers can add parts" ON service_parts_used

\n\n-- signup_attempts: keep anonymous policies\n-- "Anonymous can insert/update signup attempts" - kept (anonymous)\nDROP POLICY IF EXISTS "Admins can delete signup attempts" ON signup_attempts

\nDROP POLICY IF EXISTS "Admins can view all signup attempts" ON signup_attempts

\n\n-- skill_categories\nDROP POLICY IF EXISTS "Admins can manage skill categories" ON skill_categories

\n\n-- skills\nDROP POLICY IF EXISTS "Admins can manage skills" ON skills

\n\n-- stock_adjustment_items\nDROP POLICY IF EXISTS "Admins can manage adjustment items" ON stock_adjustment_items

\n\n-- stock_adjustments\nDROP POLICY IF EXISTS "Admins can manage adjustments" ON stock_adjustments

\n\n-- stock_movements\nDROP POLICY IF EXISTS "System can create stock movements" ON stock_movements

\n\n-- stock_reservations\nDROP POLICY IF EXISTS "Users can create stock reservations" ON stock_reservations

\nDROP POLICY IF EXISTS "Users can update own reservations" ON stock_reservations

\n\n-- stock_transfer_items\nDROP POLICY IF EXISTS "Admins can manage transfer items" ON stock_transfer_items

\n\n-- stock_transfers\nDROP POLICY IF EXISTS "Admins can manage transfers" ON stock_transfers

\n\n-- subscription_line_items: keep portal policy\n-- "Portal users can view their subscription line items" - kept (portal)\nDROP POLICY IF EXISTS "All authenticated users can create subscription line items" ON subscription_line_items

\nDROP POLICY IF EXISTS "Users can insert subscription line items" ON subscription_line_items

\n\n-- subscription_payments: keep anonymous policy\n-- "Anonymous users can create subscription payments for VIP signup" - kept (anonymous)\n\n-- task_mentions\nDROP POLICY IF EXISTS "Users can create mentions" ON task_mentions

\n\n-- tax_jurisdictions\nDROP POLICY IF EXISTS "Admins and managers can manage tax jurisdictions" ON tax_jurisdictions

\n\n-- tech_locations\nDROP POLICY IF EXISTS "Techs can insert their own location" ON tech_locations

\n\n-- technician_skills\nDROP POLICY IF EXISTS "Admins can delete technician skills" ON technician_skills

\nDROP POLICY IF EXISTS "Techs can manage their own skills" ON technician_skills

\nDROP POLICY IF EXISTS "Techs can update their own skills" ON technician_skills

\n\n-- trip_segments\nDROP POLICY IF EXISTS "Managers can view all trips" ON trip_segments

\nDROP POLICY IF EXISTS "Technicians can view own trips" ON trip_segments

\n\n-- user_points\nDROP POLICY IF EXISTS "System can insert user points" ON user_points

\n\n-- vendors\nDROP POLICY IF EXISTS "Admins can manage vendors" ON vendors

\n\n-- warehouses\nDROP POLICY IF EXISTS "Admins can manage warehouses" ON warehouses

\n
