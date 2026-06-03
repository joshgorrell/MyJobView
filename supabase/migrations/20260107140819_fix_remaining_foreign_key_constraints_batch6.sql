/*
  # Fix Remaining Foreign Key Constraints - Batch 6

  ## Summary
  Final batch of NO ACTION foreign key constraint fixes.

  ## Tables Fixed
  - service_labor_entries
  - service_parts_used
  - service_requests
  - stock_adjustments
  - stock_movements
  - stock_reservations
  - stock_transfers
  - subscription_cancellations
  - subscription_payments
  - time_clock_alerts
  - travel_bonus_requests
  - warehouses
  - work_orders
*/

-- Fix service_labor_entries
DO $$
BEGIN
  ALTER TABLE service_labor_entries DROP CONSTRAINT IF EXISTS service_labor_entries_overridden_by_fkey;
  ALTER TABLE service_labor_entries ADD CONSTRAINT service_labor_entries_overridden_by_fkey
    FOREIGN KEY (overridden_by) REFERENCES profiles(id) ON DELETE SET NULL;
    
  ALTER TABLE service_labor_entries DROP CONSTRAINT IF EXISTS service_labor_entries_tech_user_id_fkey;
  ALTER TABLE service_labor_entries ADD CONSTRAINT service_labor_entries_tech_user_id_fkey
    FOREIGN KEY (tech_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix service_parts_used
DO $$
BEGIN
  ALTER TABLE service_parts_used DROP CONSTRAINT IF EXISTS service_parts_used_overridden_by_fkey;
  ALTER TABLE service_parts_used ADD CONSTRAINT service_parts_used_overridden_by_fkey
    FOREIGN KEY (overridden_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix service_requests
DO $$
BEGIN
  ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_billable_by_user_id_fkey;
  ALTER TABLE service_requests ADD CONSTRAINT service_requests_billable_by_user_id_fkey
    FOREIGN KEY (billable_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
    
  ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_created_by_fkey;
  ALTER TABLE service_requests ADD CONSTRAINT service_requests_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix stock_adjustments
DO $$
BEGIN
  ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_approved_by_fkey;
  ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;
    
  ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_created_by_fkey;
  ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix stock_movements
DO $$
BEGIN
  ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_created_by_fkey;
  ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix stock_reservations
DO $$
BEGIN
  ALTER TABLE stock_reservations DROP CONSTRAINT IF EXISTS stock_reservations_reserved_by_fkey;
  ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_reserved_by_fkey
    FOREIGN KEY (reserved_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix stock_transfers
DO $$
BEGIN
  ALTER TABLE stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_created_by_fkey;
  ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix subscription_cancellations
DO $$
BEGIN
  ALTER TABLE subscription_cancellations DROP CONSTRAINT IF EXISTS subscription_cancellations_cancelled_by_user_id_fkey;
  ALTER TABLE subscription_cancellations ADD CONSTRAINT subscription_cancellations_cancelled_by_user_id_fkey
    FOREIGN KEY (cancelled_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix subscription_payments
DO $$
BEGIN
  ALTER TABLE subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_created_by_fkey;
  ALTER TABLE subscription_payments ADD CONSTRAINT subscription_payments_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix time_clock_alerts
DO $$
BEGIN
  ALTER TABLE time_clock_alerts DROP CONSTRAINT IF EXISTS time_clock_alerts_resolved_by_fkey;
  ALTER TABLE time_clock_alerts ADD CONSTRAINT time_clock_alerts_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix travel_bonus_requests
DO $$
BEGIN
  ALTER TABLE travel_bonus_requests DROP CONSTRAINT IF EXISTS travel_bonus_requests_approved_by_fkey;
  ALTER TABLE travel_bonus_requests ADD CONSTRAINT travel_bonus_requests_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;
    
  ALTER TABLE travel_bonus_requests DROP CONSTRAINT IF EXISTS travel_bonus_requests_technician_id_fkey;
  ALTER TABLE travel_bonus_requests ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE travel_bonus_requests ADD CONSTRAINT travel_bonus_requests_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix warehouses
DO $$
BEGIN
  ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_manager_id_fkey;
  ALTER TABLE warehouses ADD CONSTRAINT warehouses_manager_id_fkey
    FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix work_orders
DO $$
BEGIN
  ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_on_my_way_sent_by_fkey;
  ALTER TABLE work_orders ADD CONSTRAINT work_orders_on_my_way_sent_by_fkey
    FOREIGN KEY (on_my_way_sent_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;
