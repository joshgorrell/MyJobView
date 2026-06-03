/*
  # Update Email Templates for Light/Dark Mode Support

  1. Changes
    - Updates all email templates to support both light and dark themes
    - Uses CSS media queries to detect prefers-color-scheme
    - Uses adaptive colors that work in both modes
    - Improves accessibility and readability across all devices

  2. Technical Approach
    - Use color-scheme meta tag
    - Define colors for both light and dark modes
    - Use transparent/adaptive backgrounds where possible
    - Ensure proper contrast in both themes
*/

-- Update contract_invitation template
UPDATE email_templates
SET body = '<!DOCTYPE html>
<html>
  <head>
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Arial, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        background-color: #f9fafb;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #ffffff;
        padding: 30px;
        text-align: center;
        border-radius: 8px 8px 0 0;
      }
      .content {
        background: #ffffff;
        padding: 30px;
        border: 1px solid #e5e7eb;
        border-top: none;
        color: #1f2937;
      }
      .button {
        display: inline-block;
        padding: 14px 28px;
        background: #2563eb;
        color: #ffffff !important;
        text-decoration: none;
        border-radius: 6px;
        margin: 20px 0;
        font-weight: 600;
      }
      .footer {
        text-align: center;
        padding: 20px;
        color: #6b7280;
        font-size: 14px;
      }
      .info-box {
        background: #f3f4f6;
        padding: 15px;
        border-left: 4px solid #2563eb;
        margin: 20px 0;
        color: #1f2937;
      }
      
      /* Dark mode support */
      @media (prefers-color-scheme: dark) {
        body {
          background-color: #111827;
          color: #f9fafb;
        }
        .content {
          background: #1f2937;
          border-color: #374151;
          color: #f9fafb;
        }
        .info-box {
          background: #374151;
          border-left-color: #60a5fa;
          color: #f9fafb;
        }
        .footer {
          color: #9ca3af;
        }
        .button {
          background: #3b82f6;
          color: #ffffff !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Security Contract Ready</h1>
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
updated_at = now()
WHERE template_type = 'contract_invitation';

-- Update deposit_reminder template
UPDATE email_templates
SET body = '<!DOCTYPE html>
<html>
  <head>
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Arial, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        background-color: #f9fafb;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: #ffffff;
        padding: 30px;
        text-align: center;
        border-radius: 8px 8px 0 0;
      }
      .content {
        background: #ffffff;
        padding: 30px;
        border: 1px solid #e5e7eb;
        border-top: none;
        color: #1f2937;
      }
      .button {
        display: inline-block;
        padding: 14px 28px;
        background: #10b981;
        color: #ffffff !important;
        text-decoration: none;
        border-radius: 6px;
        margin: 20px 0;
        font-weight: 600;
      }
      .footer {
        text-align: center;
        padding: 20px;
        color: #6b7280;
        font-size: 14px;
      }
      .info-box {
        background: #f3f4f6;
        padding: 15px;
        border-left: 4px solid #10b981;
        margin: 20px 0;
        color: #1f2937;
      }
      
      @media (prefers-color-scheme: dark) {
        body {
          background-color: #111827;
          color: #f9fafb;
        }
        .content {
          background: #1f2937;
          border-color: #374151;
          color: #f9fafb;
        }
        .info-box {
          background: #374151;
          border-left-color: #34d399;
          color: #f9fafb;
        }
        .footer {
          color: #9ca3af;
        }
        .button {
          background: #34d399;
          color: #ffffff !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Deposit Payment Required</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>Thank you for approving your proposal! To move forward with your project, we need to collect the deposit payment.</p>

        <div class="info-box">
          <p style="margin: 0;"><strong>Deposit Amount:</strong> ${{deposit_amount}}</p>
        </div>

        <p style="text-align: center;">
          <a href="{{payment_url}}" class="button">Pay Deposit Now</a>
        </p>

        <p>Once we receive your deposit, we can schedule your project and begin work.</p>

        <p style="margin-top: 30px;">
          Best regards,<br>
          {{company_name}}
        </p>
      </div>
      <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
      </div>
    </div>
  </body>
</html>',
updated_at = now()
WHERE template_type = 'deposit_reminder';

-- Update proposal_email template
UPDATE email_templates
SET body = '<!DOCTYPE html>
<html>
  <head>
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Arial, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        background-color: #f9fafb;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: #ffffff;
        padding: 30px;
        text-align: center;
        border-radius: 8px 8px 0 0;
      }
      .content {
        background: #ffffff;
        padding: 30px;
        border: 1px solid #e5e7eb;
        border-top: none;
        color: #1f2937;
      }
      .button {
        display: inline-block;
        padding: 14px 28px;
        background: #3b82f6;
        color: #ffffff !important;
        text-decoration: none;
        border-radius: 6px;
        margin: 20px 0;
        font-weight: 600;
      }
      .footer {
        text-align: center;
        padding: 20px;
        color: #6b7280;
        font-size: 14px;
      }
      
      @media (prefers-color-scheme: dark) {
        body {
          background-color: #111827;
          color: #f9fafb;
        }
        .content {
          background: #1f2937;
          border-color: #374151;
          color: #f9fafb;
        }
        .footer {
          color: #9ca3af;
        }
        .button {
          background: #60a5fa;
          color: #ffffff !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">New Proposal for Your Review</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>We''ve prepared a proposal for your project. Please review the details and let us know if you have any questions.</p>

        <p style="text-align: center;">
          <a href="{{proposal_url}}" class="button">View Proposal</a>
        </p>

        <p>If you have any questions or would like to discuss the proposal, please don''t hesitate to contact us.</p>

        <p style="margin-top: 30px;">
          Best regards,<br>
          {{company_name}}
        </p>
      </div>
      <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
      </div>
    </div>
  </body>
</html>',
updated_at = now()
WHERE template_type = 'proposal_email';

-- Update review_request template
UPDATE email_templates
SET body = '<!DOCTYPE html>
<html>
  <head>
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Arial, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        background-color: #f9fafb;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: #ffffff;
        padding: 30px;
        text-align: center;
        border-radius: 8px 8px 0 0;
      }
      .content {
        background: #ffffff;
        padding: 30px;
        border: 1px solid #e5e7eb;
        border-top: none;
        color: #1f2937;
      }
      .button {
        display: inline-block;
        padding: 14px 28px;
        background: #f59e0b;
        color: #ffffff !important;
        text-decoration: none;
        border-radius: 6px;
        margin: 20px 0;
        font-weight: 600;
      }
      .footer {
        text-align: center;
        padding: 20px;
        color: #6b7280;
        font-size: 14px;
      }
      
      @media (prefers-color-scheme: dark) {
        body {
          background-color: #111827;
          color: #f9fafb;
        }
        .content {
          background: #1f2937;
          border-color: #374151;
          color: #f9fafb;
        }
        .footer {
          color: #9ca3af;
        }
        .button {
          background: #fbbf24;
          color: #111827 !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">We Value Your Feedback</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>Thank you for choosing {{company_name}}. We hope you''re satisfied with our service!</p>

        <p>Would you mind taking a moment to share your experience? Your feedback helps us improve and helps others make informed decisions.</p>

        <p style="text-align: center;">
          <a href="{{review_url}}" class="button">Leave a Review</a>
        </p>

        <p>Thank you for your time and support!</p>

        <p style="margin-top: 30px;">
          Best regards,<br>
          {{company_name}}
        </p>
      </div>
      <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
      </div>
    </div>
  </body>
</html>',
updated_at = now()
WHERE template_type = 'review_request';

-- Update work_order_feedback template
UPDATE email_templates
SET body = '<!DOCTYPE html>
<html>
  <head>
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Arial, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        background-color: #f9fafb;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: #ffffff;
        padding: 30px;
        text-align: center;
        border-radius: 8px 8px 0 0;
      }
      .content {
        background: #ffffff;
        padding: 30px;
        border: 1px solid #e5e7eb;
        border-top: none;
        color: #1f2937;
      }
      .button {
        display: inline-block;
        padding: 14px 28px;
        background: #10b981;
        color: #ffffff !important;
        text-decoration: none;
        border-radius: 6px;
        margin: 20px 0;
        font-weight: 600;
      }
      .footer {
        text-align: center;
        padding: 20px;
        color: #6b7280;
        font-size: 14px;
      }
      
      @media (prefers-color-scheme: dark) {
        body {
          background-color: #111827;
          color: #f9fafb;
        }
        .content {
          background: #1f2937;
          border-color: #374151;
          color: #f9fafb;
        }
        .footer {
          color: #9ca3af;
        }
        .button {
          background: #34d399;
          color: #ffffff !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Service Complete</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>Your work order has been completed. We hope you''re satisfied with the service provided by our team.</p>

        <p>We''d appreciate your feedback on the work performed. This helps us maintain our high standards and improve our service.</p>

        <p style="text-align: center;">
          <a href="{{feedback_url}}" class="button">Provide Feedback</a>
        </p>

        <p>Thank you for choosing {{company_name}}!</p>

        <p style="margin-top: 30px;">
          Best regards,<br>
          {{company_name}}
        </p>
      </div>
      <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
      </div>
    </div>
  </body>
</html>',
updated_at = now()
WHERE template_type = 'work_order_feedback';

-- Update contract_cancellation template
UPDATE email_templates
SET body = '<!DOCTYPE html>
<html>
  <head>
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Arial, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        background-color: #f9fafb;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: #ffffff;
        padding: 30px;
        text-align: center;
        border-radius: 8px 8px 0 0;
      }
      .content {
        background: #ffffff;
        padding: 30px;
        border: 1px solid #e5e7eb;
        border-top: none;
        color: #1f2937;
      }
      .footer {
        text-align: center;
        padding: 20px;
        color: #6b7280;
        font-size: 14px;
      }
      .info-box {
        background: #f3f4f6;
        padding: 15px;
        border-left: 4px solid #ef4444;
        margin: 20px 0;
        color: #1f2937;
      }
      
      @media (prefers-color-scheme: dark) {
        body {
          background-color: #111827;
          color: #f9fafb;
        }
        .content {
          background: #1f2937;
          border-color: #374151;
          color: #f9fafb;
        }
        .info-box {
          background: #374151;
          border-left-color: #f87171;
          color: #f9fafb;
        }
        .footer {
          color: #9ca3af;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Contract Cancellation Confirmation</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>This confirms that we have received your request to cancel your security monitoring contract.</p>

        <div class="info-box">
          <p style="margin: 0;"><strong>Final Billing Date:</strong> {{final_billing_date}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Cancellation Reason:</strong> {{cancellation_reason}}</p>
        </div>

        <p>Your service will remain active until {{final_billing_date}}. After this date, monitoring services will be discontinued.</p>

        <p>If you have any questions or concerns, please contact us.</p>

        <p style="margin-top: 30px;">
          Best regards,<br>
          {{company_name}}
        </p>
      </div>
      <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
      </div>
    </div>
  </body>
</html>',
updated_at = now()
WHERE template_type = 'contract_cancellation';
