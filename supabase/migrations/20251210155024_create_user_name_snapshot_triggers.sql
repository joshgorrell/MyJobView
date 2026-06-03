/*
  # Create User Name Snapshot Triggers

  ## Summary
  Creates triggers that automatically populate name snapshot fields when records
  are created or updated. This ensures user names are preserved even after deletion.

  ## Changes Made

  1. **Create Helper Functions**
     - get_user_full_name: Gets a user's full name from profiles

  2. **Create Triggers**
     - work_orders: Auto-populate created_by_name and assigned_to_name
     - proposals: Auto-populate created_by_name
     - tasks: Auto-populate assigned_to_name
     - projects: Auto-populate created_by_name
     - invoices: Auto-populate created_by_name
     - leads: Auto-populate assigned_to_name and created_by_name
     - contacts: Auto-populate assigned_to_name and created_by_name
     - sales_orders: Auto-populate created_by_name
     - service_requests: Auto-populate created_by_name
     - recurring_subscriptions: Auto-populate created_by_name

  ## Important Notes
  - Names are captured at time of creation/assignment
  - Names persist even after user deletion
  - Triggers fire on INSERT and UPDATE
*/

-- Helper function to get user's full name
CREATE OR REPLACE FUNCTION get_user_full_name(user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_name text;
BEGIN
  SELECT full_name INTO user_name
  FROM profiles
  WHERE id = user_id;
  
  RETURN user_name;
END;
$$;

-- Trigger function for work_orders
CREATE OR REPLACE FUNCTION set_work_order_user_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set created_by_name on INSERT
  IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL THEN
    NEW.created_by_name := get_user_full_name(NEW.created_by);
  END IF;

  -- Set assigned_to_name on INSERT or UPDATE
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    NEW.assigned_to_name := get_user_full_name(NEW.assigned_to);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function for proposals
CREATE OR REPLACE FUNCTION set_proposal_user_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL THEN
    NEW.created_by_name := get_user_full_name(NEW.created_by);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function for tasks
CREATE OR REPLACE FUNCTION set_task_user_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Tasks use both user_id and assigned_to
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    NEW.assigned_to_name := get_user_full_name(NEW.assigned_to);
  ELSIF NEW.user_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    NEW.assigned_to_name := get_user_full_name(NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function for projects
CREATE OR REPLACE FUNCTION set_project_user_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL THEN
    NEW.created_by_name := get_user_full_name(NEW.created_by);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function for invoices
CREATE OR REPLACE FUNCTION set_invoice_user_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL THEN
    NEW.created_by_name := get_user_full_name(NEW.created_by);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function for leads
CREATE OR REPLACE FUNCTION set_lead_user_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL THEN
    NEW.created_by_name := get_user_full_name(NEW.created_by);
  END IF;

  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    NEW.assigned_to_name := get_user_full_name(NEW.assigned_to);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function for contacts
CREATE OR REPLACE FUNCTION set_contact_user_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL THEN
    NEW.created_by_name := get_user_full_name(NEW.created_by);
  END IF;

  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    NEW.assigned_to_name := get_user_full_name(NEW.assigned_to);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function for sales_orders
CREATE OR REPLACE FUNCTION set_sales_order_user_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL THEN
    NEW.created_by_name := get_user_full_name(NEW.created_by);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function for service_requests
CREATE OR REPLACE FUNCTION set_service_request_user_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL THEN
    NEW.created_by_name := get_user_full_name(NEW.created_by);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function for recurring_subscriptions
CREATE OR REPLACE FUNCTION set_recurring_subscription_user_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL THEN
    NEW.created_by_name := get_user_full_name(NEW.created_by);
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers for all tables

DROP TRIGGER IF EXISTS trg_set_work_order_user_names ON work_orders;
CREATE TRIGGER trg_set_work_order_user_names
  BEFORE INSERT OR UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_work_order_user_names();

DROP TRIGGER IF EXISTS trg_set_proposal_user_names ON proposals;
CREATE TRIGGER trg_set_proposal_user_names
  BEFORE INSERT OR UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION set_proposal_user_names();

DROP TRIGGER IF EXISTS trg_set_task_user_names ON tasks;
CREATE TRIGGER trg_set_task_user_names
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_user_names();

DROP TRIGGER IF EXISTS trg_set_project_user_names ON projects;
CREATE TRIGGER trg_set_project_user_names
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION set_project_user_names();

DROP TRIGGER IF EXISTS trg_set_invoice_user_names ON invoices;
CREATE TRIGGER trg_set_invoice_user_names
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_user_names();

DROP TRIGGER IF EXISTS trg_set_lead_user_names ON leads;
CREATE TRIGGER trg_set_lead_user_names
  BEFORE INSERT OR UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION set_lead_user_names();

DROP TRIGGER IF EXISTS trg_set_contact_user_names ON contacts;
CREATE TRIGGER trg_set_contact_user_names
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION set_contact_user_names();

DROP TRIGGER IF EXISTS trg_set_sales_order_user_names ON sales_orders;
CREATE TRIGGER trg_set_sales_order_user_names
  BEFORE INSERT OR UPDATE ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_sales_order_user_names();

DROP TRIGGER IF EXISTS trg_set_service_request_user_names ON service_requests;
CREATE TRIGGER trg_set_service_request_user_names
  BEFORE INSERT OR UPDATE ON service_requests
  FOR EACH ROW
  EXECUTE FUNCTION set_service_request_user_names();

DROP TRIGGER IF EXISTS trg_set_recurring_subscription_user_names ON recurring_subscriptions;
CREATE TRIGGER trg_set_recurring_subscription_user_names
  BEFORE INSERT OR UPDATE ON recurring_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_recurring_subscription_user_names();
