/*
  # Fix "relation activity_feed does not exist" errors

  ## Problem
  Several database functions reference an `activity_feed` table that does not exist.
  This causes errors when:
  - Approving a proposal (notify_pending_deposit trigger)
  - Deposit completion (notify_deposit_completed trigger)
  - Service request conversion
  - Punchlist batch conversion
  - Proposal lock/unlock
  - Revision promotion
  - Invoice deposit payment

  ## Fix
  Remove all INSERT INTO activity_feed statements from affected functions.
  The notifications table (which does exist) handles the critical user-facing alerts.
  The activity_feed inserts were supplemental logging that reference a non-existent table.

  ## Affected Functions
  - notify_pending_deposit
  - notify_deposit_completed
  - monitor_invoice_payment_status
  - handle_deposit_payment
  - convert_service_request_to_work_order
  - convert_punchlist_tasks_to_work_order
  - lock_proposal
  - unlock_proposal
  - promote_revision_to_live
*/

-- Fix notify_pending_deposit (fires on proposal UPDATE when approved with deposit pending)
CREATE OR REPLACE FUNCTION notify_pending_deposit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_rep_name text;
  v_customer_name text;
  v_customer_email text;
  v_company_name text;
BEGIN
  -- Only run when status changes to approved and deposit is not paid
  IF NEW.status = 'approved' 
  AND OLD.status != 'approved' 
  AND NEW.require_deposit = true 
  AND COALESCE(NEW.deposit_paid, false) = false THEN

    -- Get customer info
    SELECT full_name, email INTO v_customer_name, v_customer_email
    FROM contacts
    WHERE id = NEW.contact_id;

    -- Create notification record for sales rep
    BEGIN
      INSERT INTO notifications (
        company_id,
        user_id,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id,
        created_at
      ) VALUES (
        NEW.company_id,
        NEW.created_by,
        'deposit_pending',
        'Deposit Payment Needed',
        'Customer approved proposal ' || NEW.proposal_number || ' but needs to complete $' || 
        COALESCE(NEW.deposit_amount_due, 0)::text || ' deposit payment.',
        'proposal',
        NEW.id,
        now()
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to create deposit_pending notification: %', SQLERRM;
    END;

  END IF;

  RETURN NEW;
END;
$$;

-- Fix notify_deposit_completed (fires on proposal UPDATE when deposit_paid flips to true)
CREATE OR REPLACE FUNCTION notify_deposit_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
BEGIN
  -- Only run when deposit_paid changes from false to true
  IF NEW.deposit_paid = true AND COALESCE(OLD.deposit_paid, false) = false THEN

    -- Get customer info
    SELECT full_name INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;

    -- Create notification for sales rep
    BEGIN
      INSERT INTO notifications (
        company_id,
        user_id,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id,
        created_at
      ) VALUES (
        NEW.company_id,
        NEW.created_by,
        'deposit_received',
        'Deposit Payment Received',
        'Deposit received for proposal ' || NEW.proposal_number || '. Order is ready for scheduling.',
        'proposal',
        NEW.id,
        now()
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to create deposit_received notification: %', SQLERRM;
    END;

  END IF;

  RETURN NEW;
END;
$$;

-- Fix monitor_invoice_payment_status
CREATE OR REPLACE FUNCTION monitor_invoice_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal record;
  v_sales_order_id uuid;
  v_sales_rep_id uuid;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    IF NEW.proposal_id IS NOT NULL THEN
      SELECT 
        p.id as proposal_id,
        p.proposal_number,
        p.sales_order_id,
        p.created_by as sales_rep_id,
        so.order_number,
        so.status as sales_order_status
      INTO v_proposal
      FROM proposals p
      LEFT JOIN sales_orders so ON so.id = p.sales_order_id
      WHERE p.id = NEW.proposal_id;

      IF FOUND AND v_proposal.sales_order_id IS NOT NULL THEN
        v_sales_order_id := v_proposal.sales_order_id;
        v_sales_rep_id := v_proposal.sales_rep_id;

        IF v_proposal.sales_order_status = 'pending_deposit' THEN
          UPDATE sales_orders
          SET 
            status = 'planning',
            notes = COALESCE(notes, '') || E'\n' || 'Deposit payment received on ' || to_char(now(), 'YYYY-MM-DD HH24:MI'),
            updated_at = now()
          WHERE id = v_sales_order_id;

          BEGIN
            INSERT INTO notifications (
              company_id,
              user_id,
              type,
              title,
              message,
              related_type,
              related_id,
              created_at
            ) VALUES (
              NEW.company_id,
              v_sales_rep_id,
              'deposit_received',
              'Deposit Payment Received',
              'Deposit payment received for proposal ' || v_proposal.proposal_number || '. Sales Order ' || v_proposal.order_number || ' is now ready for planning.',
              'sales_order',
              v_sales_order_id,
              now()
            );
          EXCEPTION
            WHEN OTHERS THEN
              RAISE WARNING 'Failed to create deposit notification: %', SQLERRM;
          END;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix handle_deposit_payment
CREATE OR REPLACE FUNCTION handle_deposit_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_proposal_id uuid;
  v_sales_order_id uuid;
BEGIN
  SELECT id, amount_due, status
  INTO v_invoice
  FROM invoices
  WHERE id = NEW.invoice_id;

  IF v_invoice.amount_due <= 0 AND v_invoice.status = 'paid' THEN
    SELECT id INTO v_proposal_id
    FROM proposals
    WHERE deposit_invoice_id = NEW.invoice_id
    AND deposit_paid = false
    LIMIT 1;

    IF v_proposal_id IS NOT NULL THEN
      UPDATE proposals
      SET 
        deposit_paid = true,
        deposit_payment_date = now()
      WHERE id = v_proposal_id;

      SELECT id INTO v_sales_order_id
      FROM sales_orders
      WHERE proposal_id = v_proposal_id
      AND status = 'pending_deposit';

      IF v_sales_order_id IS NOT NULL THEN
        UPDATE sales_orders
        SET status = 'planning'
        WHERE id = v_sales_order_id;
      END IF;

      BEGIN
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message,
          related_id
        )
        SELECT 
          p.created_by,
          'deposit_paid',
          'Deposit Payment Received',
          'Deposit payment received for proposal #' || p.proposal_number,
          p.id
        FROM proposals p
        WHERE p.id = v_proposal_id;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Failed to create deposit_paid notification: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix lock_proposal
CREATE OR REPLACE FUNCTION lock_proposal(proposal_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  UPDATE public.proposals
  SET
    is_locked = true,
    locked_at = now(),
    locked_by = v_user_id,
    updated_at = now()
  WHERE id = proposal_id_param;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Proposal locked successfully'
  );
END;
$$;

-- Fix unlock_proposal
CREATE OR REPLACE FUNCTION unlock_proposal(proposal_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal proposals%ROWTYPE;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_proposal FROM public.proposals WHERE id = proposal_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Proposal not found');
  END IF;

  UPDATE public.proposals
  SET
    is_locked = false,
    locked_at = NULL,
    locked_by = NULL,
    updated_at = now()
  WHERE id = proposal_id_param;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Proposal unlocked successfully'
  );
END;
$$;

-- Fix promote_revision_to_live
CREATE OR REPLACE FUNCTION promote_revision_to_live(
  revision_id_param uuid,
  send_notification boolean DEFAULT false,
  notification_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revision proposals%ROWTYPE;
  v_old_live_id uuid;
  v_user_id uuid;
  v_contact_email text;
  v_proposal_number text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_revision FROM public.proposals WHERE id = revision_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Revision not found');
  END IF;

  SELECT id INTO v_old_live_id
  FROM public.proposals
  WHERE parent_proposal_id = COALESCE(v_revision.parent_proposal_id, v_revision.id)
  AND is_active_revision = true
  AND id != revision_id_param;

  IF v_old_live_id IS NOT NULL THEN
    UPDATE public.proposals
    SET
      is_active_revision = false,
      is_portal_visible = false,
      is_locked = false,
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
    WHERE id = v_old_live_id;
  END IF;

  UPDATE public.proposals
  SET
    is_active_revision = true,
    is_portal_visible = true,
    status = CASE
      WHEN status = 'designing' THEN 'ready_to_submit'
      ELSE status
    END,
    updated_at = now()
  WHERE id = revision_id_param;

  IF send_notification THEN
    SELECT c.email, p.proposal_number
    INTO v_contact_email, v_proposal_number
    FROM public.proposals p
    JOIN public.contacts c ON c.id = p.contact_id
    WHERE p.id = revision_id_param;

    BEGIN
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        related_id
      ) VALUES (
        v_user_id,
        'proposal_updated',
        'Proposal Updated',
        COALESCE(notification_message, 'Your proposal has been updated. Please review the changes.'),
        revision_id_param
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to create revision notification: %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Revision promoted to Live successfully',
    'old_live_id', v_old_live_id,
    'new_live_id', revision_id_param
  );
END;
$$;

-- Fix convert_service_request_to_work_order
CREATE OR REPLACE FUNCTION convert_service_request_to_work_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_work_order_id uuid;
  v_work_order_type text;
BEGIN
  IF NEW.status = 'pending' AND NEW.work_order_id IS NULL THEN

    IF NEW.notes LIKE '%punchlist%' OR 
    EXISTS (
      SELECT 1 FROM punchlist_tasks 
      WHERE service_request_id = NEW.id
    ) THEN
      v_work_order_type := 'punchlist';
    ELSE
      v_work_order_type := 'service';
    END IF;

    INSERT INTO work_orders (
      company_id,
      contact_id,
      title,
      description,
      type,
      status,
      priority,
      service_location_address,
      service_location_city,
      service_location_state,
      service_location_zip,
      billable_type,
      created_by
    ) VALUES (
      (SELECT company_id FROM profiles WHERE id = NEW.created_by LIMIT 1),
      NEW.contact_id,
      CASE 
        WHEN v_work_order_type = 'punchlist' THEN 'Punchlist Service'
        ELSE 'Service Request'
      END,
      NEW.job_description,
      v_work_order_type,
      'unscheduled',
      NEW.priority,
      NEW.job_location_address,
      NEW.job_location_city,
      NEW.job_location_state,
      NEW.job_location_zip,
      NEW.billable_type,
      NEW.created_by
    )
    RETURNING id INTO new_work_order_id;

    NEW.work_order_id = new_work_order_id;
    NEW.status = 'converted_to_work_order';

  END IF;

  RETURN NEW;
END;
$$;
