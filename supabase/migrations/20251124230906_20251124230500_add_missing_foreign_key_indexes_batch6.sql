/*
  # Add Missing Foreign Key Indexes - Batch 6
  
  Adds indexes for foreign key columns to improve query performance.
  This batch covers punchlist through sales_orders tables.
  
  ## Changes
  - Adds indexes on foreign key columns that were missing covering indexes
*/

-- Punch List Items
CREATE INDEX IF NOT EXISTS idx_punch_list_items_assigned_to ON public.punch_list_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_punch_list_items_completed_by ON public.punch_list_items(completed_by);
CREATE INDEX IF NOT EXISTS idx_punch_list_items_punch_list_id ON public.punch_list_items(punch_list_id);

-- Punch Lists
CREATE INDEX IF NOT EXISTS idx_punch_lists_created_by ON public.punch_lists(created_by);
CREATE INDEX IF NOT EXISTS idx_punch_lists_work_order_id ON public.punch_lists(work_order_id);

-- Punchlist Access Grants
CREATE INDEX IF NOT EXISTS idx_punchlist_access_grants_contact_id ON public.punchlist_access_grants(contact_id);
CREATE INDEX IF NOT EXISTS idx_punchlist_access_grants_project_id ON public.punchlist_access_grants(project_id);
CREATE INDEX IF NOT EXISTS idx_punchlist_access_grants_subscription_id ON public.punchlist_access_grants(subscription_id);

-- Punchlist Task History
CREATE INDEX IF NOT EXISTS idx_punchlist_task_history_task_id ON public.punchlist_task_history(task_id);

-- Punchlist Task Photos
CREATE INDEX IF NOT EXISTS idx_punchlist_task_photos_task_id ON public.punchlist_task_photos(task_id);

-- Punchlist Tasks
CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_access_grant_id ON public.punchlist_tasks(access_grant_id);
CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_service_request_id ON public.punchlist_tasks(service_request_id);

-- Purchase Order Items
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON public.purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON public.purchase_order_items(product_id);

-- Purchase Orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON public.purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_id ON public.purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_warehouse_id ON public.purchase_orders(warehouse_id);

-- Recurring Invoices
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_company_id ON public.recurring_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_invoice_id ON public.recurring_invoices(invoice_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_subscription_id ON public.recurring_invoices(subscription_id);

-- Recurring Plans
CREATE INDEX IF NOT EXISTS idx_recurring_plans_company_id ON public.recurring_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_created_by ON public.recurring_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_office_id ON public.recurring_plans(office_id);

-- Recurring Subscriptions
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_cancellation_id ON public.recurring_subscriptions(cancellation_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_company_id ON public.recurring_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_contact_id ON public.recurring_subscriptions(contact_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_created_by ON public.recurring_subscriptions(created_by);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_office_id ON public.recurring_subscriptions(office_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_plan_id ON public.recurring_subscriptions(plan_id);

-- Reward Redemptions
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_reward_id ON public.reward_redemptions(reward_id);

-- Rewards Catalog
CREATE INDEX IF NOT EXISTS idx_rewards_catalog_company_id ON public.rewards_catalog(company_id);

-- Role Department Access
CREATE INDEX IF NOT EXISTS idx_role_department_access_department_id ON public.role_department_access(department_id);

-- Sales Orders
CREATE INDEX IF NOT EXISTS idx_sales_orders_contact_id ON public.sales_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_proposal_id ON public.sales_orders(proposal_id);