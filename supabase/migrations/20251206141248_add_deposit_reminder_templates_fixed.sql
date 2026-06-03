/*
  # Add Deposit Reminder Email Template

  1. New Templates
    - Email template for reminding customers to complete deposit payment
    - SMS template for quick reminders
    - Can be sent automatically or manually by sales rep

  2. Template Variables
    - customer_name, company_name, proposal_number, deposit_amount, payment_link
*/

-- Add deposit reminder email template
INSERT INTO email_templates (
  template_type,
  subject,
  body,
  is_active,
  created_at,
  updated_at
) VALUES (
  'deposit_reminder',
  'Complete Your Deposit - Proposal {{proposal_number}}',
  E'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #2563eb;">Almost There! Complete Your Deposit</h2>
  
  <p>Hi {{customer_name}},</p>
  
  <p>Thank you for approving proposal <strong>{{proposal_number}}</strong>! We\'re excited to get started on your project.</p>
  
  <p>To move forward, we just need you to complete your deposit payment of <strong>${{deposit_amount}}</strong>.</p>
  
  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0;">
    <p style="margin: 0; color: #92400e;">
      <strong>Action Required:</strong> Your sales order has been created and is pending deposit payment. Once we receive your deposit, we\'ll begin scheduling your installation.
    </p>
  </div>
  
  <p style="margin: 24px 0;">
    <a href="{{payment_link}}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
      Complete Deposit Payment
    </a>
  </p>
  
  <p>If you have any questions or need assistance, please don\'t hesitate to reach out to your sales representative.</p>
  
  <p>Best regards,<br>
  <strong>{{company_name}}</strong></p>
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
  
  <p style="font-size: 12px; color: #6b7280;">
    This is an automated reminder. If you\'ve already completed your deposit payment, please disregard this message.
  </p>
</div>',
  true,
  now(),
  now()
) ON CONFLICT (template_type) DO UPDATE SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  updated_at = now();

-- Add SMS template for deposit reminder
INSERT INTO email_templates (
  template_type,
  subject,
  body,
  is_active,
  created_at,
  updated_at
) VALUES (
  'deposit_reminder_sms',
  'Deposit Reminder SMS',
  'Hi {{customer_name}}, your proposal {{proposal_number}} is approved! To get started, please complete your ${{deposit_amount}} deposit: {{payment_link}} - {{company_name}}',
  true,
  now(),
  now()
) ON CONFLICT (template_type) DO UPDATE SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  updated_at = now();
