/*
  # Remove Duplicate Indexes

  1. Performance Improvements
    - Remove duplicate indexes that provide no additional benefit
    - Reduces storage overhead and write operation costs

  2. Indexes Removed
    - idx_appointments_subscription (duplicate of idx_appointments_recurring_subscription)
    - idx_line_item_labor_phases_sort_order (duplicate of idx_line_item_labor_phases_composite)
*/

-- Drop duplicate appointment subscription index
DROP INDEX IF EXISTS public.idx_appointments_subscription;

-- Drop duplicate labor phases sort order index
DROP INDEX IF EXISTS public.idx_line_item_labor_phases_sort_order;
