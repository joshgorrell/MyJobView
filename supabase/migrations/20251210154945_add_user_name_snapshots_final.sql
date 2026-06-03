/*
  # Add User Name Snapshots

  ## Summary
  Adds name snapshot fields to preserve user names even after a user is deleted.
  This allows the UI to display who created/was assigned to a record, even if 
  that user no longer exists in the system.

  ## Changes Made

  1. **Add Name Snapshot Fields**
     - work_orders: created_by_name, assigned_to_name
     - proposals: created_by_name
     - tasks: assigned_to_name
     - projects: created_by_name
     - invoices: created_by_name
     - leads: assigned_to_name, created_by_name
     - contacts: assigned_to_name, created_by_name
     - sales_orders: created_by_name
     - service_requests: created_by_name
     - recurring_subscriptions: created_by_name

  2. **Backfill Existing Data**
     - Populate name fields for existing records

  ## Important Notes
  - Name fields are updated automatically via triggers (next migration)
  - Names are snapshots at time of creation/assignment
  - Names persist even after user deletion
*/

-- Add name fields to work_orders
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS assigned_to_name text;

-- Add name fields to proposals
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS created_by_name text;

-- Add name fields to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to_name text;

-- Add name fields to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_name text;

-- Add name fields to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by_name text;

-- Add name fields to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to_name text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_by_name text;

-- Add name fields to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_to_name text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_by_name text;

-- Add name fields to sales_orders
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS created_by_name text;

-- Add name fields to service_requests
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS created_by_name text;

-- Add name fields to recurring_subscriptions
ALTER TABLE recurring_subscriptions ADD COLUMN IF NOT EXISTS created_by_name text;

-- Backfill existing work_orders with names
UPDATE work_orders wo
SET created_by_name = p.full_name
FROM profiles p
WHERE wo.created_by = p.id
  AND wo.created_by_name IS NULL;

UPDATE work_orders wo
SET assigned_to_name = p.full_name
FROM profiles p
WHERE wo.assigned_to = p.id
  AND wo.assigned_to_name IS NULL;

-- Backfill existing proposals with names
UPDATE proposals pr
SET created_by_name = p.full_name
FROM profiles p
WHERE pr.created_by = p.id
  AND pr.created_by_name IS NULL;

-- Backfill existing tasks with names (tasks can be assigned to user_id or assigned_to)
UPDATE tasks t
SET assigned_to_name = p.full_name
FROM profiles p
WHERE (t.assigned_to = p.id OR t.user_id = p.id)
  AND t.assigned_to_name IS NULL;

-- Backfill existing projects with names
UPDATE projects pj
SET created_by_name = p.full_name
FROM profiles p
WHERE pj.created_by = p.id
  AND pj.created_by_name IS NULL;

-- Backfill existing invoices with names
UPDATE invoices i
SET created_by_name = p.full_name
FROM profiles p
WHERE i.created_by = p.id
  AND i.created_by_name IS NULL;

-- Backfill existing leads with names
UPDATE leads l
SET assigned_to_name = p.full_name
FROM profiles p
WHERE l.assigned_to = p.id
  AND l.assigned_to_name IS NULL;

UPDATE leads l
SET created_by_name = p.full_name
FROM profiles p
WHERE l.created_by = p.id
  AND l.created_by_name IS NULL;

-- Backfill existing contacts with names
UPDATE contacts c
SET assigned_to_name = p.full_name
FROM profiles p
WHERE c.assigned_to = p.id
  AND c.assigned_to_name IS NULL;

UPDATE contacts c
SET created_by_name = p.full_name
FROM profiles p
WHERE c.created_by = p.id
  AND c.created_by_name IS NULL;

-- Backfill existing sales_orders with names
UPDATE sales_orders so
SET created_by_name = p.full_name
FROM profiles p
WHERE so.created_by = p.id
  AND so.created_by_name IS NULL;

-- Backfill existing service_requests with names
UPDATE service_requests sr
SET created_by_name = p.full_name
FROM profiles p
WHERE sr.created_by = p.id
  AND sr.created_by_name IS NULL;

-- Backfill existing recurring_subscriptions with names
UPDATE recurring_subscriptions rs
SET created_by_name = p.full_name
FROM profiles p
WHERE rs.created_by = p.id
  AND rs.created_by_name IS NULL;
