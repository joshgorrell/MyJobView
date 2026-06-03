/*
  # Add Missing Foreign Key Indexes - Batch 3
  
  1. Performance Improvements
    - Add indexes for serial, service, stock, and task related foreign keys
    - Add indexes for tax, time clock, user, and work order related foreign keys
    
  2. Purpose
    - Improves query performance for foreign key lookups
    - Reduces table scan overhead
    - Optimizes JOIN operations
*/

-- Serial and stock related indexes
CREATE INDEX IF NOT EXISTS idx_serial_lot_tracking_bin_id_fkey ON public.serial_lot_tracking(bin_id);
CREATE INDEX IF NOT EXISTS idx_serial_lot_tracking_reserved_for_proposal_id_fkey ON public.serial_lot_tracking(reserved_for_proposal_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_proposal_line_item_id_fkey ON public.stock_reservations(proposal_line_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_reserved_by_fkey ON public.stock_reservations(reserved_by);

-- Service related indexes
CREATE INDEX IF NOT EXISTS idx_service_requests_billable_by_user_id_fkey ON public.service_requests(billable_by_user_id);

-- Sticky notes indexes
CREATE INDEX IF NOT EXISTS idx_sticky_notes_converted_to_discussion_id_fkey ON public.sticky_notes(converted_to_discussion_id);
CREATE INDEX IF NOT EXISTS idx_sticky_notes_converted_to_task_id_fkey ON public.sticky_notes(converted_to_task_id);

-- Task related indexes
CREATE INDEX IF NOT EXISTS idx_task_mentions_mentioning_user_id_fkey ON public.task_mentions(mentioning_user_id);

-- Tax related indexes
CREATE INDEX IF NOT EXISTS idx_tax_exemption_certificates_verified_by_fkey ON public.tax_exemption_certificates(verified_by);

-- Time clock related indexes
CREATE INDEX IF NOT EXISTS idx_time_clock_alerts_resolved_by_fkey ON public.time_clock_alerts(resolved_by);

-- User permission related indexes
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_created_by_fkey ON public.user_permission_overrides(created_by);

-- Work order related indexes
CREATE INDEX IF NOT EXISTS idx_work_orders_archived_by_fkey ON public.work_orders(archived_by);
CREATE INDEX IF NOT EXISTS idx_work_orders_contact_id_fkey ON public.work_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_on_my_way_sent_by_fkey ON public.work_orders(on_my_way_sent_by);