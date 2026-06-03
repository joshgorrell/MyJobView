/*
  # Fix Unindexed Foreign Keys - Corrected Batch 1
  
  1. Performance Optimization
    - Add indexes to foreign key columns that are missing them
    - This batch focuses on the most frequently queried tables
    - Improves JOIN performance and foreign key constraint checks
    
  2. Tables Covered
    - proposals (contact_id, office_id, created_by, approved_by, locked_by, archived_by, template_id)
    - proposal_line_items (proposal_id, room_id, product_id, labor_phase_id, parent_item_id, class_id)
    - projects (sales_order_id, contact_id, assigned_pm, created_by, office_id)
    - work_orders (project_id, contact_id, assigned_to, created_by, office_id, labor_phase_id)
    - appointments (contact_id, project_id, created_by, assigned_technician)
*/

-- Proposals table indexes
CREATE INDEX IF NOT EXISTS idx_proposals_contact_id ON proposals(contact_id);
CREATE INDEX IF NOT EXISTS idx_proposals_office_id ON proposals(office_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created_by ON proposals(created_by);
CREATE INDEX IF NOT EXISTS idx_proposals_approved_by ON proposals(approved_by);
CREATE INDEX IF NOT EXISTS idx_proposals_locked_by ON proposals(locked_by);
CREATE INDEX IF NOT EXISTS idx_proposals_archived_by ON proposals(archived_by);
CREATE INDEX IF NOT EXISTS idx_proposals_template_id ON proposals(template_id);
CREATE INDEX IF NOT EXISTS idx_proposals_billing_action_by ON proposals(billing_action_by);
CREATE INDEX IF NOT EXISTS idx_proposals_last_emailed_by ON proposals(last_emailed_by);
CREATE INDEX IF NOT EXISTS idx_proposals_parent_proposal_id ON proposals(parent_proposal_id);

-- Proposal line items indexes
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_proposal_id ON proposal_line_items(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_room_id ON proposal_line_items(room_id);
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_product_id ON proposal_line_items(product_id);
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_labor_phase_id ON proposal_line_items(labor_phase_id);
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_parent_item_id ON proposal_line_items(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_class_id ON proposal_line_items(class_id);

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_sales_order_id ON projects(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_projects_contact_id ON projects(contact_id);
CREATE INDEX IF NOT EXISTS idx_projects_assigned_pm ON projects(assigned_pm);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_office_id ON projects(office_id);

-- Work orders table indexes
CREATE INDEX IF NOT EXISTS idx_work_orders_project_id ON work_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_contact_id ON work_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to ON work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_created_by ON work_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_work_orders_office_id ON work_orders(office_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_work_order_group_id ON work_orders(work_order_group_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_labor_phase_id ON work_orders(labor_phase_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_archived_by ON work_orders(archived_by);
CREATE INDEX IF NOT EXISTS idx_work_orders_customer_sales_rep_id ON work_orders(customer_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_on_my_way_sent_by ON work_orders(on_my_way_sent_by);

-- Appointments table indexes
CREATE INDEX IF NOT EXISTS idx_appointments_contact_id ON appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_project_id ON appointments(project_id);
CREATE INDEX IF NOT EXISTS idx_appointments_created_by ON appointments(created_by);
CREATE INDEX IF NOT EXISTS idx_appointments_assigned_technician ON appointments(assigned_technician);
CREATE INDEX IF NOT EXISTS idx_appointments_recurring_subscription_id ON appointments(recurring_subscription_id);
CREATE INDEX IF NOT EXISTS idx_appointments_recurrence_parent_id ON appointments(recurrence_parent_id);