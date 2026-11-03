/*\n  # Create Invoice Payment Status Monitoring Trigger\n\n  1. New Trigger\n    - Monitor invoices table for status changes\n    - When invoice status changes to 'paid', update related sales order\n    - Change sales order from 'pending_deposit' to 'planning'\n    - Create activity feed notification for sales rep\n    - Send notification to sales rep about deposit received\n\n  2. Business Logic\n    - Only triggers for deposit invoices linked to proposals\n    - Only updates sales orders that are in 'pending_deposit' status\n    - Creates activity feed entry for audit trail\n    - Creates notification for sales rep to take next steps\n*/\n\n-- Function to monitor invoice payment and update sales order status\nCREATE OR REPLACE FUNCTION monitor_invoice_payment_status()\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path TO 'public'\nAS $$\nDECLARE\n  v_proposal record

\n  v_sales_order_id uuid

\n  v_sales_rep_id uuid

\nBEGIN\n  -- Check if invoice status changed from non-paid to paid\n  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN\n    \n    -- Check if this invoice is linked to a proposal\n    IF NEW.proposal_id IS NOT NULL THEN\n      \n      -- Get proposal and sales order details\n      SELECT \n        p.id as proposal_id,\n        p.proposal_number,\n        p.sales_order_id,\n        p.created_by as sales_rep_id,\n        so.order_number,\n        so.status as sales_order_status\n      INTO v_proposal\n      FROM proposals p\n      LEFT JOIN sales_orders so ON so.id = p.sales_order_id\n      WHERE p.id = NEW.proposal_id

\n\n      IF FOUND AND v_proposal.sales_order_id IS NOT NULL THEN\n        v_sales_order_id := v_proposal.sales_order_id

\n        v_sales_rep_id := v_proposal.sales_rep_id

\n\n        -- Update sales order status if currently pending deposit\n        IF v_proposal.sales_order_status = 'pending_deposit' THEN\n          UPDATE sales_orders\n          SET \n            status = 'planning',\n            notes = COALESCE(notes, '') || E'\\n' || 'Deposit payment received on ' || to_char(now(), 'YYYY-MM-DD HH24:MI'),\n            updated_at = now()\n          WHERE id = v_sales_order_id

\n\n          -- Create activity feed entry\n          INSERT INTO activity_feed (\n            company_id,\n            user_id,\n            activity_type,\n            entity_type,\n            entity_id,\n            title,\n            description,\n            created_at\n          ) VALUES (\n            NEW.company_id,\n            v_sales_rep_id,\n            'deposit_received',\n            'sales_order',\n            v_sales_order_id,\n            'Deposit Payment Received',\n            'Deposit payment received for Sales Order ' || v_proposal.order_number || '. Project is now ready for planning and scheduling.',\n            now()\n          )

\n\n          -- Create notification for sales rep\n          INSERT INTO notifications (\n            company_id,\n            user_id,\n            type,\n            title,\n            message,\n            related_type,\n            related_id,\n            created_at\n          ) VALUES (\n            NEW.company_id,\n            v_sales_rep_id,\n            'deposit_received',\n            'Deposit Payment Received',\n            'Deposit payment received for proposal ' || v_proposal.proposal_number || '. Sales Order ' || v_proposal.order_number || ' is now ready for planning.',\n            'sales_order',\n            v_sales_order_id,\n            now()\n          )

\n        END IF

\n      END IF

\n    END IF

\n  END IF

\n\n  RETURN NEW

\nEND

\n$$

\n\n-- Create trigger on invoices table\nDROP TRIGGER IF EXISTS monitor_invoice_payment_status_trigger ON invoices

\nCREATE TRIGGER monitor_invoice_payment_status_trigger\n  AFTER UPDATE ON invoices\n  FOR EACH ROW\n  WHEN (NEW.status IS DISTINCT FROM OLD.status)\n  EXECUTE FUNCTION monitor_invoice_payment_status()

\n\n-- Add deposit_received notification type if not exists\nDO $$\nBEGIN\n  -- Check if we need to update the notifications type constraint\n  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check

\n  \n  -- Add new constraint with deposit_received type (including all existing types)\n  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check\n    CHECK (type IN (\n      'lead_assignment', 'lead_status_change', 'task_assignment', 'task_due', \n      'proposal_approved', 'discussion_mention', 'discussion_reply',\n      'work_order_assignment', 'service_request', 'parts_request',\n      'deposit_reminder', 'proposal_reactivation', 'proposal_message',\n      'task_notification', 'vip_signup', 'product_request', \n      'bug_report_assigned', 'bug_report_status_change',\n      'deposit_received', 'home_clock_review', 'late_clock_in',\n      'work_order_feedback', 'bug_report', 'punchlist_service_request',\n      'service_request_created', 'system'\n    ))

\nEND $$

\n\nCOMMENT ON FUNCTION monitor_invoice_payment_status() IS 'Monitors invoice status changes and updates sales order status when deposit is paid'

\nCOMMENT ON TRIGGER monitor_invoice_payment_status_trigger ON invoices IS 'Automatically updates sales order status when deposit invoice is marked as paid'

\n
