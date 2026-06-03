/*
  # Add Missing Foreign Key Indexes - Batch 7
  
  Adds indexes for foreign key columns to improve query performance.
  This batch covers security_contract through stock tables.
  
  ## Changes
  - Adds indexes on foreign key columns that were missing covering indexes
*/

-- Security Contract Approvals
CREATE INDEX IF NOT EXISTS idx_security_contract_approvals_requested_by ON public.security_contract_approvals(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_security_contract_approvals_reviewed_by ON public.security_contract_approvals(reviewed_by_user_id);

-- Security Contract Responses
CREATE INDEX IF NOT EXISTS idx_security_contract_responses_field_id ON public.security_contract_responses(field_id);

-- Security Contract Templates
CREATE INDEX IF NOT EXISTS idx_security_contract_templates_default_billing_plan_id ON public.security_contract_templates(default_billing_plan_id);

-- Security Contracts
CREATE INDEX IF NOT EXISTS idx_security_contracts_approved_by_user_id ON public.security_contracts(approved_by_user_id);
CREATE INDEX IF NOT EXISTS idx_security_contracts_subscription_id ON public.security_contracts(subscription_id);

-- Serial Lot Tracking
CREATE INDEX IF NOT EXISTS idx_serial_lot_tracking_product_id ON public.serial_lot_tracking(product_id);
CREATE INDEX IF NOT EXISTS idx_serial_lot_tracking_warehouse_id ON public.serial_lot_tracking(warehouse_id);

-- Service Additional Charges
CREATE INDEX IF NOT EXISTS idx_service_additional_charges_added_by ON public.service_additional_charges(added_by);
CREATE INDEX IF NOT EXISTS idx_service_additional_charges_service_billing_queue_id ON public.service_additional_charges(service_billing_queue_id);

-- Service Billing Queue
CREATE INDEX IF NOT EXISTS idx_service_billing_queue_assigned_to_user_id ON public.service_billing_queue(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_service_billing_queue_contact_id ON public.service_billing_queue(contact_id);
CREATE INDEX IF NOT EXISTS idx_service_billing_queue_invoice_id ON public.service_billing_queue(invoice_id);
CREATE INDEX IF NOT EXISTS idx_service_billing_queue_service_request_id ON public.service_billing_queue(service_request_id);
CREATE INDEX IF NOT EXISTS idx_service_billing_queue_work_order_id ON public.service_billing_queue(work_order_id);

-- Service Labor Entries
CREATE INDEX IF NOT EXISTS idx_service_labor_entries_overridden_by ON public.service_labor_entries(overridden_by);
CREATE INDEX IF NOT EXISTS idx_service_labor_entries_service_billing_queue_id ON public.service_labor_entries(service_billing_queue_id);
CREATE INDEX IF NOT EXISTS idx_service_labor_entries_tech_user_id ON public.service_labor_entries(tech_user_id);
CREATE INDEX IF NOT EXISTS idx_service_labor_entries_work_order_id ON public.service_labor_entries(work_order_id);

-- Service Parts Used
CREATE INDEX IF NOT EXISTS idx_service_parts_used_overridden_by ON public.service_parts_used(overridden_by);
CREATE INDEX IF NOT EXISTS idx_service_parts_used_product_id ON public.service_parts_used(product_id);
CREATE INDEX IF NOT EXISTS idx_service_parts_used_service_billing_queue_id ON public.service_parts_used(service_billing_queue_id);
CREATE INDEX IF NOT EXISTS idx_service_parts_used_work_order_id ON public.service_parts_used(work_order_id);

-- Service Requests
CREATE INDEX IF NOT EXISTS idx_service_requests_contact_id ON public.service_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_created_by ON public.service_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_service_requests_work_order_id ON public.service_requests(work_order_id);

-- SMS Logs
CREATE INDEX IF NOT EXISTS idx_sms_logs_appointment_id ON public.sms_logs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_contact_id ON public.sms_logs(contact_id);

-- Stock Adjustment Items
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_adjustment_id ON public.stock_adjustment_items(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_product_id ON public.stock_adjustment_items(product_id);

-- Stock Adjustments
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_approved_by ON public.stock_adjustments(approved_by);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_created_by ON public.stock_adjustments(created_by);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_warehouse_id ON public.stock_adjustments(warehouse_id);

-- Stock Movements
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by ON public.stock_movements(created_by);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_id ON public.stock_movements(warehouse_id);

-- Stock Reservations
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product_id ON public.stock_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_proposal_id ON public.stock_reservations(proposal_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_warehouse_id ON public.stock_reservations(warehouse_id);

-- Stock Transfer Items
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product_id ON public.stock_transfer_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer_id ON public.stock_transfer_items(transfer_id);

-- Stock Transfers
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_by ON public.stock_transfers(created_by);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_warehouse_id ON public.stock_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_warehouse_id ON public.stock_transfers(to_warehouse_id);