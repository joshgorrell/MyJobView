/*
  # Add Contract Cancellation Email Template

  1. Changes
    - Add 'contract_cancellation_received' email template
    - Update notification type constraint to include contract cancellation notifications

  2. Purpose
    - Send confirmation email when customer submits cancellation request
    - Notify admin/finance when new cancellation request is submitted
*/

-- Add email template for cancellation confirmation
INSERT INTO email_templates (template_type, subject, body)
VALUES (
  'contract_cancellation_received',
  'Contract Cancellation Request Received - {{contract_number}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #dc2626;">Contract Cancellation Request Received</h2>
    
    <p>Dear {{customer_name}},</p>
    
    <p>We have received your request to cancel your security monitoring contract <strong>{{contract_number}}</strong>.</p>
    
    <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #991b1b;">Cancellation Details</h3>
      <p style="margin: 8px 0;"><strong>Contract Number:</strong> {{contract_number}}</p>
      <p style="margin: 8px 0;"><strong>Requested End Date:</strong> {{requested_end_date}}</p>
      <p style="margin: 8px 0;"><strong>Reason:</strong> {{cancellation_reason}}</p>
      {{#if is_early_termination}}
      <p style="margin: 8px 0;"><strong>Early Termination Fee:</strong> ${{buyout_amount}}</p>
      <p style="margin: 8px 0; color: #991b1b;"><em>Note: Your contract has more than 90 days remaining. An early termination fee applies.</em></p>
      {{/if}}
    </div>
    
    <h3>What Happens Next?</h3>
    <ol>
      <li>Our team will review your cancellation request within 1-2 business days</li>
      <li>We will contact you to confirm the cancellation details and next steps</li>
      {{#if is_early_termination}}
      <li>You will receive payment instructions for the early termination fee</li>
      {{/if}}
      <li>Your monitoring service will continue until your selected end date</li>
      <li>You will receive a final invoice for any remaining charges</li>
    </ol>
    
    <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Important:</strong> We bill monthly on the 1st of each month. If your selected end date is after the 1st, you will be billed for the entire month.</p>
    </div>
    
    <p>If you have any questions or would like to discuss your cancellation, please don''t hesitate to contact us.</p>
    
    <p>Best regards,<br>Your Security Team</p>
  </div>'
)
ON CONFLICT (template_type) DO UPDATE SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  updated_at = now();

-- Update notification types to include contract cancellation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications'
    AND column_name = 'type'
  ) THEN
    ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;
    
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'task',
      'lead_assigned',
      'lead_status_change',
      'task_assigned',
      'task_due_soon',
      'task_overdue',
      'task_completed',
      'task_comment',
      'appointment_reminder',
      'proposal_viewed',
      'proposal_accepted',
      'proposal_rejected',
      'proposal_message',
      'proposal_reactivated',
      'invoice_overdue',
      'punchlist_task_assigned',
      'work_order_assigned',
      'work_order_status_change',
      'service_request_created',
      'parts_request_created',
      'parts_request_approved',
      'deposit_reminder',
      'contract_cancellation_requested',
      'late_clock_in'
    ));
  END IF;
END $$;
