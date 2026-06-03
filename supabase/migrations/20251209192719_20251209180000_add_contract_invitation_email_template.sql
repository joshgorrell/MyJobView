/*
  # Add Security Contract Invitation Email Template

  1. Changes
    - Adds contract_invitation email template to email_templates table
    - Provides customizable email for when security contracts are sent to customers
    - Template includes placeholders for customer name, onboarding URL, expiration days, and company name

  2. Template Details
    - Subject: Customizable subject line for contract invitation
    - Body: HTML email template with instructions for completing the contract
    - Active by default
    - Can be customized by admins in Admin > Email Templates
*/

-- Insert contract invitation email template
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'contract_invitation',
  'Your Security Contract is Ready for Signature',
  '<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
      .button { display: inline-block; padding: 14px 28px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
      .button:hover { background: #1d4ed8; }
      .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
      .info-box { background: #f3f4f6; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px;">Security Contract Ready</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>Your security monitoring contract is ready for your review and signature.</p>

        <div class="info-box">
          <p style="margin: 0;"><strong>What''s Next:</strong></p>
          <ul style="margin: 10px 0;">
            <li>Review your contract details</li>
            <li>Complete any required fields</li>
            <li>Review terms and conditions</li>
            <li>Provide your digital signature</li>
            <li>Set up recurring billing (if applicable)</li>
          </ul>
        </div>

        <p style="text-align: center;">
          <a href="{{onboarding_url}}" class="button">Complete Your Contract</a>
        </p>

        <p><strong>Important:</strong> This link will expire in {{expiration_days}} days. If you have any questions, please contact us.</p>

        <p style="margin-top: 30px;">
          Best regards,<br>
          {{company_name}}
        </p>
      </div>
      <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
        <p>If you did not expect this email, please contact us immediately.</p>
      </div>
    </div>
  </body>
</html>',
  true
)
ON CONFLICT (template_type) DO UPDATE SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  updated_at = now();
