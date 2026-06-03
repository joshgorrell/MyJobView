/*
  # Add Missing Foreign Key Indexes

  1. Performance & Security Improvements
    - Add indexes for foreign keys without covering indexes
    - Improves query performance and join operations

  2. Indexes Added
    - daily_clock_entries(auto_clock_out_approved_by)
    - discount_codes(created_by)
    - platform_pricing(created_by)
    - platform_pricing_history(changed_by)
    - prospect_competitor_relationships(created_by)
    - scheduled_connection_occurrences(connection_id)
*/

-- Add missing foreign key indexes
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_auto_clock_out_approved_by
  ON public.daily_clock_entries(auto_clock_out_approved_by);

CREATE INDEX IF NOT EXISTS idx_discount_codes_created_by
  ON public.discount_codes(created_by);

CREATE INDEX IF NOT EXISTS idx_platform_pricing_created_by
  ON public.platform_pricing(created_by);

CREATE INDEX IF NOT EXISTS idx_platform_pricing_history_changed_by
  ON public.platform_pricing_history(changed_by);

CREATE INDEX IF NOT EXISTS idx_prospect_competitor_relationships_created_by
  ON public.prospect_competitor_relationships(created_by);

CREATE INDEX IF NOT EXISTS idx_scheduled_connection_occurrences_connection_id
  ON public.scheduled_connection_occurrences(connection_id);
