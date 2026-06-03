/*
  # Fix Function Search Paths - Batch 2
  
  1. Functions Fixed (50 functions)
    - Contact and punchlist functions
    - Event creation functions
    - Inventory management functions
    - Number generation functions
    - Tax and calculation functions
    - Notification and logging functions
    - User access and permission functions
  
  2. Security Impact
    - Prevents search_path manipulation attacks
    - Ensures functions always reference correct schema
*/

ALTER FUNCTION contact_has_punchlist_access SET search_path = public;
ALTER FUNCTION create_contact_event SET search_path = public;
ALTER FUNCTION create_discussion_post_event SET search_path = public;
ALTER FUNCTION create_inventory_for_new_product SET search_path = public;
ALTER FUNCTION create_inventory_for_new_warehouse SET search_path = public;
ALTER FUNCTION create_manual_punchlist_invite SET search_path = public;
ALTER FUNCTION create_proposal_version SET search_path = public;
ALTER FUNCTION create_sales_order_and_project_from_proposal SET search_path = public;
ALTER FUNCTION create_task_event SET search_path = public;
ALTER FUNCTION create_travel_bonus_request SET search_path = public;
ALTER FUNCTION decline_punchlist_invite SET search_path = public;
ALTER FUNCTION enroll_in_workflow SET search_path = public;
ALTER FUNCTION estimate_travel_time SET search_path = public;
ALTER FUNCTION expire_old_proposals SET search_path = public;
ALTER FUNCTION generate_adjustment_number SET search_path = public;
ALTER FUNCTION generate_change_order_number SET search_path = public;
ALTER FUNCTION generate_po_number SET search_path = public;
ALTER FUNCTION generate_proposal_number SET search_path = public;
ALTER FUNCTION generate_recurring_appointments SET search_path = public;
ALTER FUNCTION generate_transfer_number SET search_path = public;
ALTER FUNCTION generate_work_order_number SET search_path = public;
ALTER FUNCTION get_applicable_tax_rate SET search_path = public;
ALTER FUNCTION get_appointments_needing_reminders SET search_path = public;
ALTER FUNCTION get_next_order_number SET search_path = public;
ALTER FUNCTION get_next_project_number SET search_path = public;
ALTER FUNCTION get_punchlist_access_info SET search_path = public;
ALTER FUNCTION get_tech_current_location SET search_path = public;
ALTER FUNCTION get_top_performers SET search_path = public;
ALTER FUNCTION get_user_accessible_modules SET search_path = public;
ALTER FUNCTION get_user_module_access SET search_path = public;
ALTER FUNCTION get_user_points_balance SET search_path = public;
ALTER FUNCTION get_user_visibility_scope SET search_path = public;
ALTER FUNCTION handle_new_user SET search_path = public;
ALTER FUNCTION is_manager_user SET search_path = public;
ALTER FUNCTION is_staff_user SET search_path = public;
ALTER FUNCTION log_parts_usage_from_request SET search_path = public;
ALTER FUNCTION log_punchlist_task_change SET search_path = public;
ALTER FUNCTION log_sms SET search_path = public;
ALTER FUNCTION log_work_order_status_change SET search_path = public;
ALTER FUNCTION log_workflow_email SET search_path = public;
ALTER FUNCTION mark_expired_punchlist_access SET search_path = public;
ALTER FUNCTION mark_punchlist_task_completed SET search_path = public;
ALTER FUNCTION mark_reminder_sent SET search_path = public;
ALTER FUNCTION notify_task_created SET search_path = public;
ALTER FUNCTION notify_task_status_changed SET search_path = public;
ALTER FUNCTION process_stock_adjustment SET search_path = public;
ALTER FUNCTION process_stock_transfer SET search_path = public;
ALTER FUNCTION process_subscription_cancellation SET search_path = public;
