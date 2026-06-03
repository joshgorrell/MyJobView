/*
  # Add Missing Foreign Key Indexes - Part 2

  ## Overview
  Continues adding indexes for unindexed foreign keys.

  ## Changes
  - Add indexes for recurring billing tables
  - Add indexes for service billing tables
  - Add indexes for stock management tables
  - Add indexes for subscription tables
  - Add indexes for tech location and status tables
  - Add indexes for time and travel tables
  - Add indexes for VIP tracking
  - Add indexes for warehouse and work order tables
*/

-- Recurring invoices
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_company_id ON public.recurring_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_invoice_id ON public.recurring_invoices(invoice_id);

-- Recurring plans
CREATE INDEX IF NOT EXISTS idx_recurring_plans_created_by ON public.recurring_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_office_id ON public.recurring_plans(office_id);

-- Recurring subscriptions
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_cancellation ON public.recurring_subscriptions(cancellation_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_created_by ON public.recurring_subscriptions(created_by);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_office_id ON public.recurring_subscriptions(office_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_plan_id ON public.recurring_subscriptions(plan_id);

-- Service additional charges
CREATE INDEX IF NOT EXISTS idx_service_additional_charges_added_by ON public.service_additional_charges(added_by);

-- Service billing queue
CREATE INDEX IF NOT EXISTS idx_service_billing_queue_contact_id ON public.service_billing_queue(contact_id);
CREATE INDEX IF NOT EXISTS idx_service_billing_queue_service_request_id ON public.service_billing_queue(service_request_id);

-- Service labor entries
CREATE INDEX IF NOT EXISTS idx_service_labor_entries_overridden_by ON public.service_labor_entries(overridden_by);

-- Service parts used
CREATE INDEX IF NOT EXISTS idx_service_parts_used_overridden_by ON public.service_parts_used(overridden_by);

-- Stock adjustment items
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_adjustment_id ON public.stock_adjustment_items(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_product_id ON public.stock_adjustment_items(product_id);

-- Stock adjustments
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_approved_by ON public.stock_adjustments(approved_by);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_created_by ON public.stock_adjustments(created_by);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_warehouse_id ON public.stock_adjustments(warehouse_id);

-- Stock movements
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by ON public.stock_movements(created_by);

-- Stock transfer items
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product_id ON public.stock_transfer_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer_id ON public.stock_transfer_items(transfer_id);

-- Stock transfers
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_by ON public.stock_transfers(created_by);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_warehouse_id ON public.stock_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_warehouse_id ON public.stock_transfers(to_warehouse_id);

-- Subscription cancellations
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_cancelled_by_user_id ON public.subscription_cancellations(cancelled_by_user_id);

-- Subscription line items
CREATE INDEX IF NOT EXISTS idx_subscription_line_items_product_id ON public.subscription_line_items(product_id);

-- Tech locations
CREATE INDEX IF NOT EXISTS idx_tech_locations_technician_id ON public.tech_locations(technician_id);

-- Technician status
CREATE INDEX IF NOT EXISTS idx_technician_status_current_appointment_id ON public.technician_status(current_appointment_id);

-- Time entries
CREATE INDEX IF NOT EXISTS idx_time_entries_approved_by ON public.time_entries(approved_by);

-- Travel bonus requests
CREATE INDEX IF NOT EXISTS idx_travel_bonus_requests_approved_by ON public.travel_bonus_requests(approved_by);
CREATE INDEX IF NOT EXISTS idx_travel_bonus_requests_daily_clock_entry_id ON public.travel_bonus_requests(daily_clock_entry_id);

-- Travel logs
CREATE INDEX IF NOT EXISTS idx_travel_logs_appointment_id ON public.travel_logs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_travel_logs_approved_by ON public.travel_logs(approved_by);

-- VIP program tracking
CREATE INDEX IF NOT EXISTS idx_vip_program_tracking_assigned_technician ON public.vip_program_tracking(assigned_technician);
CREATE INDEX IF NOT EXISTS idx_vip_program_tracking_contact_id ON public.vip_program_tracking(contact_id);

-- Warehouses
CREATE INDEX IF NOT EXISTS idx_warehouses_manager_id ON public.warehouses(manager_id);

-- Work orders
CREATE INDEX IF NOT EXISTS idx_work_orders_contact_id ON public.work_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_created_by ON public.work_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_work_orders_merge_id ON public.work_orders(merge_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_parent_split_id ON public.work_orders(parent_split_id);
