/*
  # Fix Function Search Paths - Batch 1
  
  1. Security Issue
    - Functions without explicit search_path can be vulnerable to search_path manipulation attacks
    - Attackers could create malicious schemas/tables that get called instead of intended ones
  
  2. Functions Fixed (20 functions)
    - All point awarding functions
    - All calculation functions  
    - Clock-related functions
    - Workflow and revision functions
  
  3. Solution
    - Set search_path to 'public' for all functions
    - This ensures functions always reference the correct schema
*/

-- Set search_path for all functions that need it
ALTER FUNCTION add_revision_entry SET search_path = public;
ALTER FUNCTION advance_workflow_enrollment SET search_path = public;
ALTER FUNCTION award_clock_in_points SET search_path = public;
ALTER FUNCTION award_points SET search_path = public;
ALTER FUNCTION award_points_for_connection SET search_path = public;
ALTER FUNCTION award_points_for_contact SET search_path = public;
ALTER FUNCTION award_points_for_lead_created SET search_path = public;
ALTER FUNCTION award_points_for_lead_status_change SET search_path = public;
ALTER FUNCTION award_task_points SET search_path = public;
ALTER FUNCTION calculate_break_duration SET search_path = public;
ALTER FUNCTION calculate_claim_duration SET search_path = public;
ALTER FUNCTION calculate_daily_clock_hours SET search_path = public;
ALTER FUNCTION calculate_distance_meters SET search_path = public;
ALTER FUNCTION calculate_distance_miles SET search_path = public;
ALTER FUNCTION calculate_eta SET search_path = public;
ALTER FUNCTION calculate_line_item_tax SET search_path = public;
ALTER FUNCTION calculate_next_billing_date SET search_path = public;
ALTER FUNCTION calculate_proposal_line_item_labor SET search_path = public;
ALTER FUNCTION check_max_starred_modules SET search_path = public;
ALTER FUNCTION cleanup_old_tech_locations SET search_path = public;
