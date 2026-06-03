/*
  # Update Remaining Email Templates for Dark Mode Support

  1. Changes
    - Updates all remaining email templates with dark mode support
    - Uses CSS media queries for prefers-color-scheme
    - Ensures proper contrast and readability in both light and dark modes
    - Provides consistent styling across all email templates

  2. Templates Updated
    - appointment_reminder
    - invoice_sent
    - issue_alert
    - lead_notification
    - password_reset
    - portal_magic_link
    - proposal_sent
    - punchlist_invite
    - service_request_update
    - welcome_email
    - work_order_assigned
*/

-- Update appointment_reminder template
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
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
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
        border-left: 4px solid #8b5cf6;
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
          border-left-color: #a78bfa;
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
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Appointment Reminder</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>This is a reminder about your upcoming appointment with {{company_name}}.</p>

        <div class="info-box">
          <p style="margin: 0;"><strong>Date & Time:</strong> {{appointment_date}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Location:</strong> {{appointment_location}}</p>
        </div>

        <p>If you need to reschedule or cancel, please contact us as soon as possible.</p>

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
WHERE template_type = 'appointment_reminder';

-- Update invoice_sent template
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
        background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
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
        background: #0ea5e9;
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
        border-left: 4px solid #0ea5e9;
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
          border-left-color: #38bdf8;
          color: #f9fafb;
        }
        .footer {
          color: #9ca3af;
        }
        .button {
          background: #38bdf8;
          color: #ffffff !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Invoice {{invoice_number}}</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>Thank you for your business. Please find your invoice details below.</p>

        <div class="info-box">
          <p style="margin: 0;"><strong>Invoice Number:</strong> {{invoice_number}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Amount Due:</strong> {{invoice_amount}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Due Date:</strong> {{due_date}}</p>
        </div>

        <p style="text-align: center;">
          <a href="{{payment_url}}" class="button">View & Pay Invoice</a>
        </p>

        <p>If you have any questions about this invoice, please contact us.</p>

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
WHERE template_type = 'invoice_sent';

-- Update portal_magic_link template
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
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Portal Access Link</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>Click the button below to access your {{company_name}} customer portal.</p>

        <p style="text-align: center;">
          <a href="{{magic_link}}" class="button">Access Portal</a>
        </p>

        <p><strong>Important:</strong> This link will expire in 1 hour for security purposes.</p>

        <p>If you did not request this link, please ignore this email.</p>

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
WHERE template_type = 'portal_magic_link';

-- Update proposal_sent template
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
      .info-box {
        background: #f3f4f6;
        padding: 15px;
        border-left: 4px solid #3b82f6;
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
          border-left-color: #60a5fa;
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
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">New Proposal</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>We''ve prepared a proposal for your project. Please review the details and let us know if you have any questions.</p>

        <div class="info-box">
          <p style="margin: 0;"><strong>Proposal Number:</strong> {{proposal_number}}</p>
        </div>

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
WHERE template_type = 'proposal_sent';

-- Update punchlist_invite template
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
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Welcome to Test & Tune</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>Welcome to our Test & Tune program! You can now track your project progress and report any issues directly through your customer portal.</p>

        <p style="text-align: center;">
          <a href="{{invite_url}}" class="button">Access Your Portal</a>
        </p>

        <p>With your portal, you can:</p>
        <ul>
          <li>View your project status</li>
          <li>Report issues or concerns</li>
          <li>Track issue resolutions</li>
          <li>Communicate with our team</li>
        </ul>

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
WHERE template_type = 'punchlist_invite';

-- Update welcome_email template
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
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Welcome!</h1>
      </div>
      <div class="content">
        <p>Dear {{user_name}},</p>

        <p>Welcome to {{company_name}}! We''re excited to have you on board.</p>

        <p>Your account has been created and you can now access your dashboard.</p>

        <p style="text-align: center;">
          <a href="{{login_url}}" class="button">Access Your Account</a>
        </p>

        <p>If you have any questions or need assistance, please don''t hesitate to reach out to our support team.</p>

        <p style="margin-top: 30px;">
          Best regards,<br>
          {{company_name}} Team
        </p>
      </div>
      <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
      </div>
    </div>
  </body>
</html>',
updated_at = now()
WHERE template_type = 'welcome_email';

-- Update work_order_assigned template
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
        background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);
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
        background: #ec4899;
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
        border-left: 4px solid #ec4899;
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
          border-left-color: #f472b6;
          color: #f9fafb;
        }
        .footer {
          color: #9ca3af;
        }
        .button {
          background: #f472b6;
          color: #ffffff !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">New Work Order</h1>
      </div>
      <div class="content">
        <p>Dear {{technician_name}},</p>

        <p>A new work order has been assigned to you.</p>

        <div class="info-box">
          <p style="margin: 0;"><strong>Work Order:</strong> {{work_order_number}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Customer:</strong> {{customer_name}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Scheduled:</strong> {{scheduled_date}}</p>
        </div>

        <p style="text-align: center;">
          <a href="{{work_order_url}}" class="button">View Work Order</a>
        </p>

        <p>Please review the details and prepare accordingly.</p>

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
WHERE template_type = 'work_order_assigned';

-- Update password_reset template
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
      .button {
        display: inline-block;
        padding: 14px 28px;
        background: #ef4444;
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
          background: #f87171;
          color: #ffffff !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Password Reset</h1>
      </div>
      <div class="content">
        <p>Dear {{user_name}},</p>

        <p>We received a request to reset your password. Click the button below to create a new password.</p>

        <p style="text-align: center;">
          <a href="{{reset_url}}" class="button">Reset Password</a>
        </p>

        <p><strong>Important:</strong> This link will expire in 1 hour for security purposes.</p>

        <p>If you did not request a password reset, please ignore this email and your password will remain unchanged.</p>

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
WHERE template_type = 'password_reset';
