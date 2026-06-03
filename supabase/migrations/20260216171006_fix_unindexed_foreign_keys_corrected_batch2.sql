/*
  # Fix Unindexed Foreign Keys - Corrected Batch 2
  
  1. Performance Optimization
    - Add indexes to foreign key columns in activity and tracking tables
    - Improves query performance for feeds, notifications, and history
    
  2. Tables Covered
    - invoices (contact_id, project_id, sales_order_id, created_by, office_id, proposal_id)
    - sales_orders (proposal_id, contact_id, created_by, lead_technician_id)
    - time_entries (technician_id, work_order_id, project_id, approved_by)
    - notifications (user_id, related_id, lead_id, message_id)
*/

-- Invoices table indexes
CREATE INDEX IF NOT EXISTS idx_invoices_contact_id ON invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sales_order_id ON invoices(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_office_id ON invoices(office_id);
CREATE INDEX IF NOT EXISTS idx_invoices_proposal_id ON invoices(proposal_id);

-- Sales orders table indexes
CREATE INDEX IF NOT EXISTS idx_sales_orders_proposal_id ON sales_orders(proposal_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_contact_id ON sales_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_created_by ON sales_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_sales_orders_lead_technician_id ON sales_orders(lead_technician_id);

-- Time entries indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_technician_id ON time_entries(technician_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_work_order_id ON time_entries(work_order_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_approved_by ON time_entries(approved_by);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_related_id ON notifications(related_id);
CREATE INDEX IF NOT EXISTS idx_notifications_lead_id ON notifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_notifications_message_id ON notifications(message_id);