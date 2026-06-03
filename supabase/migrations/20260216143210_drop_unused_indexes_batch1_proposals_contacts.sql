/*
  # Drop Unused Indexes - Batch 1 (Proposals & Contacts)

  1. Performance Improvements
    - Remove indexes that are never used by queries
    - Reduces storage overhead and speeds up write operations

  2. Tables Targeted
    - proposals (heavily accessed table)
    - contacts (heavily accessed table)
    - products (catalog table)
*/

-- Drop unused proposal indexes
DROP INDEX IF EXISTS public.idx_proposals_po_pending;
DROP INDEX IF EXISTS public.idx_proposals_purchase_order_number;
DROP INDEX IF EXISTS public.idx_proposals_sales_order_id;
DROP INDEX IF EXISTS public.idx_proposals_suppress_notifications;
DROP INDEX IF EXISTS public.idx_proposals_use_customer_override;
DROP INDEX IF EXISTS public.idx_proposals_archived_by;
DROP INDEX IF EXISTS public.idx_proposals_lead_id;
DROP INDEX IF EXISTS public.idx_proposals_office_id;
DROP INDEX IF EXISTS public.idx_proposals_expires_at;
DROP INDEX IF EXISTS public.idx_proposals_pending_deposits;
DROP INDEX IF EXISTS public.idx_proposals_deposit_invoice_id;
DROP INDEX IF EXISTS public.idx_proposals_tax_reporting;
DROP INDEX IF EXISTS public.idx_proposals_pending_actions;
DROP INDEX IF EXISTS public.idx_proposals_unread_messages;
DROP INDEX IF EXISTS public.idx_proposals_archived_at;
DROP INDEX IF EXISTS public.idx_proposals_status_updated_at;
DROP INDEX IF EXISTS public.idx_proposals_payment_terms;
DROP INDEX IF EXISTS public.idx_proposals_orphaned;
DROP INDEX IF EXISTS public.idx_proposals_report_template;
DROP INDEX IF EXISTS public.idx_proposals_search;
DROP INDEX IF EXISTS public.idx_proposals_billing_action_by;
DROP INDEX IF EXISTS public.idx_proposals_organization_id;
DROP INDEX IF EXISTS public.idx_proposals_list_query;
DROP INDEX IF EXISTS public.idx_proposals_expiration_status;
DROP INDEX IF EXISTS public.idx_proposals_number_search;
DROP INDEX IF EXISTS public.idx_proposals_total_sort;
DROP INDEX IF EXISTS public.idx_proposals_pending_deposits_optimized;

-- Drop unused contact indexes
DROP INDEX IF EXISTS public.idx_contacts_office_id;
DROP INDEX IF EXISTS public.idx_contacts_portal_access_cache;
DROP INDEX IF EXISTS public.idx_contacts_last_portal_access;
DROP INDEX IF EXISTS public.idx_contacts_temperature;
DROP INDEX IF EXISTS public.idx_contacts_orphaned;
DROP INDEX IF EXISTS public.idx_contacts_qbo_sync_status;
DROP INDEX IF EXISTS public.idx_contacts_organization_id;

-- Drop unused product indexes
DROP INDEX IF EXISTS public.idx_products_item_type;
DROP INDEX IF EXISTS public.idx_products_class_id;
DROP INDEX IF EXISTS public.idx_products_default_class_id;
DROP INDEX IF EXISTS public.idx_products_vendor_id;
DROP INDEX IF EXISTS public.idx_products_manufacturer_id;
DROP INDEX IF EXISTS public.idx_products_category;
DROP INDEX IF EXISTS public.idx_products_subcategory;
