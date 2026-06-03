/*
  # Fix Duplicate Index and Function Search Path

  ## Summary
  1. Drops duplicate index on work_orders.assigned_to
  2. Sets immutable search_path on check_late_clock_in function to prevent
     search path injection attacks

  ## Changes
  - DROP idx_work_orders_assigned_tech (duplicate of idx_work_orders_assigned_to)
  - ALTER FUNCTION check_late_clock_in SET search_path = public, pg_temp
*/

DROP INDEX IF EXISTS public.idx_work_orders_assigned_tech;

ALTER FUNCTION public.check_late_clock_in()
  SET search_path = public, pg_temp;
