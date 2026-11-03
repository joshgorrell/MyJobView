/*\n  # Set organization_id default to get_user_org_id() - Batch 3\n\n  Tables from proposal_settings through work_orders (remaining tables)\n\n  ## Purpose\n  Auto-populate organization_id on INSERT without frontend changes\n*/\n\nALTER TABLE proposal_settings ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_versions ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposals ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE prospect_competitor_relationships ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE pto_accrual_history ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE pto_balances ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE pto_policies ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE pto_requests ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE punch_list_items ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE punch_lists ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE punchlist_access_grants ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE punchlist_task_history ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE punchlist_task_photos ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE punchlist_tasks ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE purchase_order_items ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE purchase_orders ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE push_subscriptions ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE quickbooks_settings ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE quickbooks_staged_customers ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE quickbooks_sync_logs ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE quickbooks_synced_customers ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE recurring_invoices ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE recurring_plans ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE recurring_subscriptions ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE review_requests ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE reward_redemptions ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE rewards_catalog ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE role_department_access ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE role_module_access ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE roles ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE sales_orders ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE scheduled_connection_occurrences ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE scheduled_connections ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE security_contract_approvals ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE security_contract_cancellations ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE security_contract_emergency_contacts ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE security_contract_equipment ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE security_contract_fields ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE security_contract_responses ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE security_contract_services ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE security_contract_templates ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE security_contracts ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE serial_lot_tracking ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE service_additional_charges ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE service_billing_queue ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE service_labor_entries ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE service_parts_used ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE service_requests ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE session_cleanup_log ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE signup_attempts ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE skill_categories ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE skills ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE sms_logs ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE sticky_notes ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE stock_adjustment_items ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE stock_adjustments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE stock_movements ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE stock_reservations ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE stock_transfer_items ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE stock_transfers ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE subscription_cancellations ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE subscription_line_items ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE subscription_payments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE task_comments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE task_mentions ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE task_watchers ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE tasks ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE tax_exemption_certificates ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE tax_jurisdictions ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE tech_locations ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE technician_locations ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE technician_skills ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE technician_status ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE time_adjustment_requests ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE time_clock_alerts ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE time_entries ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE travel_bonus_requests ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE travel_logs ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE trip_segments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE user_activity_log ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE user_column_preferences ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE user_offices ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE user_permission_overrides ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE user_points ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE user_sessions ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE user_starred_modules ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE user_visibility_settings ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE vendors ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE vip_program_tracking ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE warehouse_bins ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE warehouses ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE work_order_materials ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE work_order_task_completions ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE work_order_tasks ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE work_orders ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\n
