/*
  # Drop Duplicate Indexes

  ## Summary
  Removes duplicate indexes identified by comparing index definitions. For each
  set of duplicates, the first (typically the older or more specifically named) index
  is kept and the redundant copy is dropped. This reduces storage and write overhead.

  ## Indexes Dropped (duplicates of kept indexes)
  - idx_products_default_vendor_id (duplicate of idx_products_default_vendor_id_fkey)
  - idx_proposals_approved_by (duplicate of idx_proposals_approved_by_fkey)
  - idx_tasks_lead_id (duplicate of tasks_lead_id_idx)
  - idx_product_packages_category_id (duplicate of idx_product_packages_category_id_fkey)
  - idx_product_package_items_product_id (duplicate of idx_product_package_items_product_id_fkey)
  - idx_product_packages_labor_phase_id (duplicate of idx_product_packages_labor_phase_id_fkey)
  - idx_tasks_user_id (duplicate of tasks_user_id_idx)
  - idx_invoices_proposal (duplicate of idx_invoices_proposal_id)
  - idx_work_orders_contact_id (duplicate of idx_work_orders_contact_id_fkey)
  - idx_message_threads_assigned_sales_rep (duplicate of idx_message_threads_assigned_sales_rep_id)
  - idx_work_orders_archived_by (duplicate of idx_work_orders_archived_by_fkey)
  - idx_work_orders_on_my_way_sent_by (duplicate of idx_work_orders_on_my_way_sent_by_fkey)
  - idx_work_orders_assigned_to (duplicate of idx_work_orders_assigned)
*/

DROP INDEX IF EXISTS idx_products_default_vendor_id;
DROP INDEX IF EXISTS idx_proposals_approved_by;
DROP INDEX IF EXISTS idx_tasks_lead_id;
DROP INDEX IF EXISTS idx_product_packages_category_id;
DROP INDEX IF EXISTS idx_product_package_items_product_id;
DROP INDEX IF EXISTS idx_product_packages_labor_phase_id;
DROP INDEX IF EXISTS idx_tasks_user_id;
DROP INDEX IF EXISTS idx_invoices_proposal;
DROP INDEX IF EXISTS idx_work_orders_contact_id;
DROP INDEX IF EXISTS idx_message_threads_assigned_sales_rep;
DROP INDEX IF EXISTS idx_work_orders_archived_by;
DROP INDEX IF EXISTS idx_work_orders_on_my_way_sent_by;
DROP INDEX IF EXISTS idx_work_orders_assigned_to;
