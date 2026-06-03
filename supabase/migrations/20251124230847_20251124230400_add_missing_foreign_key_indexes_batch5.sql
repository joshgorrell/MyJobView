/*
  # Add Missing Foreign Key Indexes - Batch 5
  
  Adds indexes for foreign key columns to improve query performance.
  This batch covers payments through proposal tables.
  
  ## Changes
  - Adds indexes on foreign key columns that were missing covering indexes
*/

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);

-- Pending Punchlist Invites
CREATE INDEX IF NOT EXISTS idx_pending_punchlist_invites_project_id ON public.pending_punchlist_invites(project_id);

-- Points Configuration
CREATE INDEX IF NOT EXISTS idx_points_configuration_company_id ON public.points_configuration(company_id);

-- Points History
CREATE INDEX IF NOT EXISTS idx_points_history_task_id ON public.points_history(task_id);

-- Product Inventory
CREATE INDEX IF NOT EXISTS idx_product_inventory_bin_id ON public.product_inventory(bin_id);
CREATE INDEX IF NOT EXISTS idx_product_inventory_warehouse_id ON public.product_inventory(warehouse_id);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON public.products(vendor_id);

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_contact_id ON public.profiles(contact_id);
CREATE INDEX IF NOT EXISTS idx_profiles_primary_office_id ON public.profiles(primary_office_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id);

-- Project Commission Overrides
CREATE INDEX IF NOT EXISTS idx_project_commission_overrides_created_by ON public.project_commission_overrides(created_by);

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_contact_id ON public.projects(contact_id);
CREATE INDEX IF NOT EXISTS idx_projects_office_id ON public.projects(office_id);
CREATE INDEX IF NOT EXISTS idx_projects_sales_order_id ON public.projects(sales_order_id);

-- Proposal Line Items
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_proposal_id ON public.proposal_line_items(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_room_id ON public.proposal_line_items(room_id);

-- Proposal Rooms
CREATE INDEX IF NOT EXISTS idx_proposal_rooms_proposal_id ON public.proposal_rooms(proposal_id);

-- Proposals
CREATE INDEX IF NOT EXISTS idx_proposals_contact_id ON public.proposals(contact_id);
CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON public.proposals(lead_id);