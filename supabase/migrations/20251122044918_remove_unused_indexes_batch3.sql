/*
  # Remove Unused Indexes - Batch 3 (Final)

  1. Purpose
    - Final cleanup of unused indexes
    - Focus on warehouse, work orders, and administrative tables
*/

-- Warehouse and inventory
DROP INDEX IF EXISTS idx_purchase_orders_status;
DROP INDEX IF EXISTS idx_purchase_orders_vendor;
DROP INDEX IF EXISTS idx_purchase_orders_created_by;
DROP INDEX IF EXISTS idx_purchase_orders_warehouse_id;
DROP INDEX IF EXISTS idx_purchase_order_items_po_id;
DROP INDEX IF EXISTS idx_purchase_order_items_product_id;
DROP INDEX IF EXISTS idx_product_inventory_product;
DROP INDEX IF EXISTS idx_product_inventory_warehouse;
DROP INDEX IF EXISTS idx_product_inventory_low_stock;
DROP INDEX IF EXISTS idx_product_inventory_bin;
DROP INDEX IF EXISTS idx_stock_movements_product;
DROP INDEX IF EXISTS idx_stock_movements_warehouse;
DROP INDEX IF EXISTS idx_stock_movements_created;
DROP INDEX IF EXISTS idx_stock_movements_created_by;
DROP INDEX IF EXISTS idx_stock_adjustments_warehouse_id;
DROP INDEX IF EXISTS idx_stock_adjustments_approved_by;
DROP INDEX IF EXISTS idx_stock_adjustments_created_by;
DROP INDEX IF EXISTS idx_stock_adjustment_items_adjustment_id;
DROP INDEX IF EXISTS idx_stock_adjustment_items_product_id;
DROP INDEX IF EXISTS idx_stock_transfers_from_warehouse_id;
DROP INDEX IF EXISTS idx_stock_transfers_to_warehouse_id;
DROP INDEX IF EXISTS idx_stock_transfers_created_by;
DROP INDEX IF EXISTS idx_stock_transfer_items_transfer_id;
DROP INDEX IF EXISTS idx_stock_transfer_items_product_id;
DROP INDEX IF EXISTS idx_warehouse_bins_warehouse;
DROP INDEX IF EXISTS idx_warehouse_bins_active;
DROP INDEX IF EXISTS idx_warehouses_manager_id;
DROP INDEX IF EXISTS idx_serial_tracking_product;
DROP INDEX IF EXISTS idx_serial_tracking_warehouse;
DROP INDEX IF EXISTS idx_serial_tracking_serial;
DROP INDEX IF EXISTS idx_serial_tracking_status;
DROP INDEX IF EXISTS idx_stock_reservations_proposal;
DROP INDEX IF EXISTS idx_stock_reservations_product;
DROP INDEX IF EXISTS idx_stock_reservations_warehouse;
DROP INDEX IF EXISTS idx_stock_reservations_status;

-- Work orders and production
DROP INDEX IF EXISTS idx_work_orders_project;
DROP INDEX IF EXISTS idx_work_orders_dates;
DROP INDEX IF EXISTS idx_work_orders_location_status;
DROP INDEX IF EXISTS idx_work_orders_needs_info;
DROP INDEX IF EXISTS idx_work_orders_split_part;
DROP INDEX IF EXISTS idx_work_orders_merge_target;
DROP INDEX IF EXISTS idx_work_orders_contact_id;
DROP INDEX IF EXISTS idx_work_orders_created_by;
DROP INDEX IF EXISTS idx_work_orders_merge_id;
DROP INDEX IF EXISTS idx_work_orders_parent_split_id;
DROP INDEX IF EXISTS idx_wo_tasks_work_order;
DROP INDEX IF EXISTS idx_wo_tasks_assigned;
DROP INDEX IF EXISTS idx_wo_materials_work_order;
DROP INDEX IF EXISTS idx_wo_materials_product;
DROP INDEX IF EXISTS idx_change_orders_project;
DROP INDEX IF EXISTS idx_change_orders_status;
DROP INDEX IF EXISTS idx_change_orders_approved_by;
DROP INDEX IF EXISTS idx_change_orders_requested_by;
DROP INDEX IF EXISTS idx_punch_lists_work_order;
DROP INDEX IF EXISTS idx_punch_lists_created_by;
DROP INDEX IF EXISTS idx_punch_items_list;
DROP INDEX IF EXISTS idx_punch_list_items_assigned_to;
DROP INDEX IF EXISTS idx_punch_list_items_completed_by;

-- Job tracking
DROP INDEX IF EXISTS idx_job_status_history_work_order;
DROP INDEX IF EXISTS idx_job_status_history_technician;
DROP INDEX IF EXISTS idx_job_acceptance_log_work_order;
DROP INDEX IF EXISTS idx_job_acceptance_log_technician;
DROP INDEX IF EXISTS idx_job_splits_parent;
DROP INDEX IF EXISTS idx_job_splits_created_by;
DROP INDEX IF EXISTS idx_job_split_parts_split;
DROP INDEX IF EXISTS idx_job_split_parts_wo;
DROP INDEX IF EXISTS idx_job_split_parts_tech;
DROP INDEX IF EXISTS idx_job_merges_target;
DROP INDEX IF EXISTS idx_job_merges_merged_by;
DROP INDEX IF EXISTS idx_job_merge_sources_merge;
DROP INDEX IF EXISTS idx_job_merge_sources_source_work_order_id;

-- VIP and time tracking
DROP INDEX IF EXISTS idx_vip_tracking_project;
DROP INDEX IF EXISTS idx_vip_tracking_status;
DROP INDEX IF EXISTS idx_vip_tracking_dates;
DROP INDEX IF EXISTS idx_vip_program_tracking_contact_id;
DROP INDEX IF EXISTS idx_vip_program_tracking_assigned_technician;
DROP INDEX IF EXISTS idx_time_entries_tech_date;
DROP INDEX IF EXISTS idx_time_entries_work_order;
DROP INDEX IF EXISTS idx_time_entries_status;
DROP INDEX IF EXISTS idx_time_entries_approved_by;

-- Daily clock and travel
DROP INDEX IF EXISTS idx_daily_clock_technician;
DROP INDEX IF EXISTS idx_daily_clock_status;
DROP INDEX IF EXISTS idx_daily_clock_office;
DROP INDEX IF EXISTS idx_daily_clock_entries_adjusted_by;
DROP INDEX IF EXISTS idx_rewards_log_tech;
DROP INDEX IF EXISTS idx_gps_technician;
DROP INDEX IF EXISTS idx_gps_daily_entry;
DROP INDEX IF EXISTS idx_gps_work_order;
DROP INDEX IF EXISTS idx_gps_location;
DROP INDEX IF EXISTS idx_travel_settings_office;
DROP INDEX IF EXISTS idx_travel_bonus_tech;
DROP INDEX IF EXISTS idx_travel_bonus_work_order;
DROP INDEX IF EXISTS idx_travel_bonus_office;
DROP INDEX IF EXISTS idx_travel_bonus_requests_approved_by;
DROP INDEX IF EXISTS idx_travel_bonus_requests_daily_clock_entry_id;
DROP INDEX IF EXISTS idx_travel_logs_tech_date;
DROP INDEX IF EXISTS idx_travel_logs_status;
DROP INDEX IF EXISTS idx_travel_logs_appointment_id;
DROP INDEX IF EXISTS idx_travel_logs_approved_by;

-- Parts and photos
DROP INDEX IF EXISTS idx_parts_requests_tech;
DROP INDEX IF EXISTS idx_parts_requests_work_order;
DROP INDEX IF EXISTS idx_parts_requests_urgency;
DROP INDEX IF EXISTS idx_parts_requests_approved_by;
DROP INDEX IF EXISTS idx_parts_requests_requested_at;
DROP INDEX IF EXISTS idx_job_photos_work_order;
DROP INDEX IF EXISTS idx_job_photos_tech;
DROP INDEX IF EXISTS idx_job_photos_category;
DROP INDEX IF EXISTS idx_job_photos_customer_visible;
DROP INDEX IF EXISTS idx_job_photos_taken_at;
DROP INDEX IF EXISTS idx_parts_usage_work_order;
DROP INDEX IF EXISTS idx_parts_usage_tech;
DROP INDEX IF EXISTS idx_parts_usage_inventory;
DROP INDEX IF EXISTS idx_parts_usage_request;
DROP INDEX IF EXISTS idx_parts_usage_used_at;

-- Job completion
DROP INDEX IF EXISTS idx_job_templates_job_type;
DROP INDEX IF EXISTS idx_job_templates_active;
DROP INDEX IF EXISTS idx_job_completions_work_order;
DROP INDEX IF EXISTS idx_job_completions_tech;
DROP INDEX IF EXISTS idx_job_completions_template_id;

-- Skills and crew
DROP INDEX IF EXISTS idx_skills_category;
DROP INDEX IF EXISTS idx_skills_active;
DROP INDEX IF EXISTS idx_technician_skills_tech;
DROP INDEX IF EXISTS idx_technician_skills_skill;
DROP INDEX IF EXISTS idx_technician_skills_proficiency;
DROP INDEX IF EXISTS idx_crew_assignments_appointment;
DROP INDEX IF EXISTS idx_crew_assignments_lead_tech;
DROP INDEX IF EXISTS idx_crew_assignments_created_by;
DROP INDEX IF EXISTS idx_technician_status_current_appointment_id;
DROP INDEX IF EXISTS idx_tech_locations_technician_id;

-- Recurring and subscriptions
DROP INDEX IF EXISTS idx_recurring_plans_company;
DROP INDEX IF EXISTS idx_recurring_plans_active;
DROP INDEX IF EXISTS idx_recurring_plans_created_by;
DROP INDEX IF EXISTS idx_recurring_plans_office_id;
DROP INDEX IF EXISTS idx_recurring_subscriptions_company;
DROP INDEX IF EXISTS idx_recurring_subscriptions_contact;
DROP INDEX IF EXISTS idx_recurring_subscriptions_status;
DROP INDEX IF EXISTS idx_recurring_subscriptions_cancellation_requested;
DROP INDEX IF EXISTS idx_recurring_subscriptions_cancellation;
DROP INDEX IF EXISTS idx_recurring_subscriptions_created_by;
DROP INDEX IF EXISTS idx_recurring_subscriptions_office_id;
DROP INDEX IF EXISTS idx_recurring_subscriptions_plan_id;
DROP INDEX IF EXISTS idx_recurring_invoices_subscription;
DROP INDEX IF EXISTS idx_recurring_invoices_scheduled;
DROP INDEX IF EXISTS idx_recurring_invoices_company_id;
DROP INDEX IF EXISTS idx_recurring_invoices_invoice_id;
DROP INDEX IF EXISTS idx_subscription_line_items_subscription;
DROP INDEX IF EXISTS idx_subscription_line_items_product_id;
DROP INDEX IF EXISTS idx_subscription_cancellations_cancelled_by_user_id;

-- Administrative
DROP INDEX IF EXISTS idx_profiles_role;
DROP INDEX IF EXISTS idx_profiles_contact_id;
DROP INDEX IF EXISTS idx_profiles_contact;
DROP INDEX IF EXISTS idx_profiles_role_id;
DROP INDEX IF EXISTS idx_profiles_points_earned;
DROP INDEX IF EXISTS idx_default_starred_modules_role;
DROP INDEX IF EXISTS idx_default_starred_modules_module_id;
DROP INDEX IF EXISTS idx_menu_items_enabled;
DROP INDEX IF EXISTS idx_menu_item_roles_lookup;
DROP INDEX IF EXISTS idx_issue_reports_user_id;
DROP INDEX IF EXISTS idx_issue_reports_status;
DROP INDEX IF EXISTS idx_issue_reports_created_at;
DROP INDEX IF EXISTS idx_issue_reports_issue_type;

-- Points and rewards
DROP INDEX IF EXISTS idx_points_configuration_company_id;
DROP INDEX IF EXISTS idx_reward_redemptions_status;
DROP INDEX IF EXISTS idx_reward_redemptions_reward_id;
DROP INDEX IF EXISTS idx_rewards_catalog_company_id;

-- Tax and exemptions
DROP INDEX IF EXISTS idx_tax_exemption_certificates_contact;
DROP INDEX IF EXISTS idx_tax_exemption_certificates_company;
DROP INDEX IF EXISTS idx_tax_exemption_certificates_active;

-- Punchlist
DROP INDEX IF EXISTS idx_punchlist_access_contact;
DROP INDEX IF EXISTS idx_punchlist_access_project;
DROP INDEX IF EXISTS idx_punchlist_access_subscription;
DROP INDEX IF EXISTS idx_punchlist_tasks_contact;
DROP INDEX IF EXISTS idx_punchlist_tasks_status;
DROP INDEX IF EXISTS idx_punchlist_tasks_access_grant;
DROP INDEX IF EXISTS idx_punchlist_tasks_service_request;
DROP INDEX IF EXISTS idx_punchlist_history_task;
DROP INDEX IF EXISTS idx_punchlist_task_photos_task_id;
DROP INDEX IF EXISTS idx_punchlist_task_photos_uploaded_at;
DROP INDEX IF EXISTS idx_pending_invites_contact;
DROP INDEX IF EXISTS idx_pending_invites_project;
DROP INDEX IF EXISTS idx_pending_invites_created;

-- Roles and permissions
DROP INDEX IF EXISTS idx_roles_role_key;
DROP INDEX IF EXISTS idx_roles_is_active;
DROP INDEX IF EXISTS idx_role_department_access_dept;

-- Department and module access
DROP INDEX IF EXISTS idx_department_access_has_access;
DROP INDEX IF EXISTS idx_department_access_granted_by;
DROP INDEX IF EXISTS idx_module_access_has_access;
DROP INDEX IF EXISTS idx_module_access_granted_by;

-- Email workflows
DROP INDEX IF EXISTS idx_email_workflows_company_id;
DROP INDEX IF EXISTS idx_email_workflow_enrollments_current_step_id;
DROP INDEX IF EXISTS idx_email_workflow_enrollments_workflow_id;
DROP INDEX IF EXISTS idx_email_workflow_logs_step_id;
DROP INDEX IF EXISTS idx_email_workflow_steps_template_id;

-- Miscellaneous
DROP INDEX IF EXISTS idx_distance_matrix_coords;
DROP INDEX IF EXISTS idx_distance_matrix_expires;
DROP INDEX IF EXISTS idx_user_column_prefs_user;
DROP INDEX IF EXISTS idx_portal_cache_manufacturer;
DROP INDEX IF EXISTS idx_portal_cache_product_id;
DROP INDEX IF EXISTS idx_portal_cache_category;
DROP INDEX IF EXISTS idx_portal_cache_last_synced;
DROP INDEX IF EXISTS idx_control4_proposal;
DROP INDEX IF EXISTS idx_control4_project;
DROP INDEX IF EXISTS idx_control4_c4_project;
DROP INDEX IF EXISTS idx_customers_stage_id;

-- Sales orders
DROP INDEX IF EXISTS idx_sales_orders_company;
DROP INDEX IF EXISTS idx_sales_orders_proposal;
DROP INDEX IF EXISTS idx_sales_orders_contact;
DROP INDEX IF EXISTS idx_sales_orders_status;

COMMENT ON SCHEMA public IS 'Cleaned up 300+ unused indexes for better write performance and reduced storage overhead';
