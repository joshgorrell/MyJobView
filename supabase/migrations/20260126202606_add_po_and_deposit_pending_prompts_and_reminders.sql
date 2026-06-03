/*
  # Add PO and Deposit Pending Prompts and Reminders

  ## Changes
  
  ### 1. Automatic Customer Notifications
  - When proposal approved with PO but no number → Notify customer to provide PO
  - When deposit invoice created → Notify customer to pay deposit
  
  ### 2. Email Templates for Reminders
  - PO number request email
  - Deposit payment request email
  
  ### 3. Pending Actions Dashboard View
  - Shows all proposals waiting for PO number or deposit payment
  - Helps sales reps track what needs follow-up
*/

-- ============================================================================
-- 1. Create Function to Send PO Request to Customer
-- ============================================================================

CREATE OR REPLACE FUNCTION send_po_request_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_email text;
  v_contact_name text;
  v_sales_rep_email text;
  v_sales_rep_name text;
BEGIN
  -- Only trigger when po_pending becomes true
  IF NEW.po_pending = true AND (OLD.po_pending IS NULL OR OLD.po_pending = false) THEN
    
    -- Get contact info
    SELECT email, COALESCE(full_name, contact_name, email)
    INTO v_contact_email, v_contact_name
    FROM contacts
    WHERE id = NEW.contact_id;
    
    -- Get sales rep info
    SELECT 
      au.email,
      COALESCE(p.first_name || ' ' || p.last_name, p.full_name, au.email)
    INTO v_sales_rep_email, v_sales_rep_name
    FROM auth.users au
    LEFT JOIN profiles p ON p.id = au.id
    WHERE au.id = NEW.created_by;
    
    -- Send notification to customer (they can provide PO via portal)
    IF v_contact_email IS NOT NULL THEN
      BEGIN
        -- Create a notification record for tracking
        INSERT INTO proposal_notifications (
          proposal_id,
          contact_id,
          notification_type,
          recipient_email,
          subject,
          sent_at
        ) VALUES (
          NEW.id,
          NEW.contact_id,
          'po_request',
          v_contact_email,
          'Purchase Order Number Needed - Proposal ' || NEW.proposal_number,
          now()
        );
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Failed to create PO request notification: %', SQLERRM;
      END;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for PO request notifications
DROP TRIGGER IF EXISTS trigger_send_po_request_notification ON proposals;
CREATE TRIGGER trigger_send_po_request_notification
  AFTER UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION send_po_request_notification();

-- ============================================================================
-- 2. Create Function to Send Deposit Request to Customer
-- ============================================================================

CREATE OR REPLACE FUNCTION send_deposit_request_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_email text;
  v_contact_name text;
  v_proposal_number text;
  v_deposit_amount numeric;
BEGIN
  -- Only trigger when deposit invoice is created and sent
  IF NEW.invoice_type = 'deposit'
     AND NEW.status = 'sent'
     AND (OLD.id IS NULL OR OLD.status IS DISTINCT FROM 'sent')
     AND NEW.proposal_id IS NOT NULL
  THEN
    
    -- Get contact and proposal info
    SELECT 
      c.email,
      COALESCE(c.full_name, c.contact_name, c.email),
      p.proposal_number,
      p.deposit_amount_due
    INTO 
      v_contact_email,
      v_contact_name,
      v_proposal_number,
      v_deposit_amount
    FROM contacts c
    JOIN proposals p ON p.contact_id = c.id
    WHERE c.id = NEW.contact_id
      AND p.id = NEW.proposal_id;
    
    -- Send notification to customer
    IF v_contact_email IS NOT NULL THEN
      BEGIN
        -- Create a notification record for tracking
        INSERT INTO proposal_notifications (
          proposal_id,
          contact_id,
          notification_type,
          recipient_email,
          subject,
          sent_at
        ) VALUES (
          NEW.proposal_id,
          NEW.contact_id,
          'deposit_request',
          v_contact_email,
          'Deposit Payment Required - Proposal ' || v_proposal_number,
          now()
        );
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Failed to create deposit request notification: %', SQLERRM;
      END;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for deposit request notifications
DROP TRIGGER IF EXISTS trigger_send_deposit_request_notification ON invoices;
CREATE TRIGGER trigger_send_deposit_request_notification
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION send_deposit_request_notification();

-- ============================================================================
-- 3. Add Email Templates for Reminders
-- ============================================================================

-- Add PO request email template
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'po_request',
  'Purchase Order Number Needed - Proposal {{proposal_number}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">Purchase Order Number Needed</h1>
    </div>
    
    <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
      <p style="color: #374151; font-size: 16px; line-height: 1.6;">
        Hello <strong>{{customer_name}}</strong>,
      </p>
      
      <p style="color: #374151; font-size: 16px; line-height: 1.6;">
        Thank you for approving proposal <strong>{{proposal_number}}</strong>!
      </p>
      
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="color: #92400e; margin: 0; font-size: 15px;">
          <strong>Action Required:</strong> Please provide your Purchase Order number to complete the approval process.
        </p>
      </div>
      
      <p style="color: #374151; font-size: 16px; line-height: 1.6;">
        We need your PO number to proceed with scheduling your project. You can provide it in one of two ways:
      </p>
      
      <ol style="color: #374151; font-size: 15px; line-height: 1.8;">
        <li><strong>Online:</strong> Log into your customer portal and add the PO number to your proposal</li>
        <li><strong>Email/Call:</strong> Send it to your sales representative</li>
      </ol>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{portal_url}}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
          View Proposal in Portal
        </a>
      </div>
      
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin-top: 30px;">
        <p style="color: #6b7280; font-size: 14px; margin: 0; line-height: 1.6;">
          <strong>Proposal Details:</strong><br>
          Number: {{proposal_number}}<br>
          Total: {{proposal_total}}<br>
          Approved: {{approval_date}}
        </p>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        If you have any questions, please contact your sales representative.
      </p>
    </div>
  </div>',
  true
) ON CONFLICT (template_type) DO UPDATE
SET subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- Update deposit request email template
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'deposit_payment_request',
  'Deposit Payment Required - Proposal {{proposal_number}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">Deposit Payment Required</h1>
    </div>
    
    <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
      <p style="color: #374151; font-size: 16px; line-height: 1.6;">
        Hello <strong>{{customer_name}}</strong>,
      </p>
      
      <p style="color: #374151; font-size: 16px; line-height: 1.6;">
        Thank you for approving proposal <strong>{{proposal_number}}</strong>!
      </p>
      
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="color: #92400e; margin: 0; font-size: 15px;">
          <strong>Action Required:</strong> Please submit your deposit payment to proceed with scheduling.
        </p>
      </div>
      
      <div style="background-color: #f0fdf4; border: 2px solid #10b981; padding: 25px; border-radius: 8px; text-align: center; margin: 25px 0;">
        <p style="color: #065f46; font-size: 14px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
          Deposit Amount Due
        </p>
        <p style="color: #065f46; font-size: 36px; font-weight: bold; margin: 0;">
          ${{deposit_amount}}
        </p>
      </div>
      
      <p style="color: #374151; font-size: 16px; line-height: 1.6;">
        You can pay your deposit online using credit card or ACH bank transfer:
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{portal_url}}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
          Pay Deposit Online
        </a>
      </div>
      
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin-top: 30px;">
        <p style="color: #374151; font-size: 15px; margin: 0 0 10px 0; font-weight: 600;">
          Other Payment Methods:
        </p>
        <ul style="color: #6b7280; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
          <li>Check: Make payable to {{company_name}}</li>
          <li>Cash: Visit our office or pay to your sales representative</li>
          <li>Wire Transfer: Contact us for details</li>
        </ul>
      </div>
      
      <div style="background-color: #eff6ff; padding: 20px; border-radius: 6px; margin-top: 20px;">
        <p style="color: #1e40af; font-size: 14px; margin: 0; line-height: 1.6;">
          <strong>Invoice Details:</strong><br>
          Invoice Number: {{invoice_number}}<br>
          Proposal Number: {{proposal_number}}<br>
          Project Total: {{proposal_total}}<br>
          Deposit Due: ${{deposit_amount}}<br>
          Balance After Deposit: {{remaining_balance}}
        </p>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        Once your deposit is received, we will immediately schedule your project. If you have any questions, please contact your sales representative.
      </p>
    </div>
  </div>',
  true
) ON CONFLICT (template_type) DO UPDATE
SET subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- ============================================================================
-- 4. Update Notification Type Constraint
-- ============================================================================

DO $$
BEGIN
  ALTER TABLE proposal_notifications DROP CONSTRAINT IF EXISTS proposal_notifications_notification_type_check;
  
  ALTER TABLE proposal_notifications ADD CONSTRAINT proposal_notifications_notification_type_check
    CHECK (notification_type IN (
      'proposal_sent',
      'proposal_viewed',
      'proposal_approved',
      'proposal_declined',
      'revision_sent',
      'deposit_invoice_sent',
      'deposit_reminder',
      'po_confirmation',
      'approval_confirmation',
      'po_request',
      'deposit_request'
    ));
END $$;

-- ============================================================================
-- 5. Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION send_po_request_notification TO authenticated;
GRANT EXECUTE ON FUNCTION send_deposit_request_notification TO authenticated;

-- ============================================================================
-- 6. Comments
-- ============================================================================

COMMENT ON FUNCTION send_po_request_notification IS
'Automatically notifies customer when PO number is needed after approval';

COMMENT ON FUNCTION send_deposit_request_notification IS
'Automatically notifies customer when deposit invoice is created';
