/*
  # Update Final Email Templates for Dark Mode Support

  1. Changes
    - Updates the last remaining email templates with dark mode support
    - Ensures all templates are responsive to device theme preferences
    - Provides consistent styling and readability

  2. Templates Updated
    - lead_notification
    - service_request_update
    - issue_alert
    - daily_summary
*/

-- Update lead_notification template
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
        background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
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
        background: #06b6d4;
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
        border-left: 4px solid #06b6d4;
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
          border-left-color: #22d3ee;
          color: #f9fafb;
        }
        .footer {
          color: #9ca3af;
        }
        .button {
          background: #22d3ee;
          color: #ffffff !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">New Lead Assigned</h1>
      </div>
      <div class="content">
        <p>Dear {{user_name}},</p>

        <p>A new lead has been assigned to you.</p>

        <div class="info-box">
          <p style="margin: 0;"><strong>Lead Name:</strong> {{lead_name}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Contact:</strong> {{lead_contact}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Source:</strong> {{lead_source}}</p>
        </div>

        <p style="text-align: center;">
          <a href="{{lead_url}}" class="button">View Lead Details</a>
        </p>

        <p>Please follow up with this lead as soon as possible.</p>

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
WHERE template_type = 'lead_notification';

-- Update service_request_update template
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
        background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%);
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
        border-left: 4px solid #14b8a6;
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
          border-left-color: #2dd4bf;
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
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Service Request Update</h1>
      </div>
      <div class="content">
        <p>Dear {{customer_name}},</p>

        <p>Your service request has been updated.</p>

        <div class="info-box">
          <p style="margin: 0;"><strong>Request Number:</strong> {{service_request_number}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Status:</strong> {{status}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Update:</strong> {{update_message}}</p>
        </div>

        <p>If you have any questions, please contact us.</p>

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
WHERE template_type = 'service_request_update';

-- Update issue_alert template
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
        background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
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
        background: #dc2626;
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
      .alert-box {
        background: #fef2f2;
        padding: 15px;
        border-left: 4px solid #dc2626;
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
        .alert-box {
          background: #450a0a;
          border-left-color: #ef4444;
          color: #fecaca;
        }
        .footer {
          color: #9ca3af;
        }
        .button {
          background: #ef4444;
          color: #ffffff !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">🚨 Critical Issue Alert</h1>
      </div>
      <div class="content">
        <p>Dear Team,</p>

        <p>A critical issue has been reported that requires immediate attention.</p>

        <div class="alert-box">
          <p style="margin: 0;"><strong>Issue Number:</strong> {{issue_number}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Priority:</strong> CRITICAL</p>
          <p style="margin: 10px 0 0 0;"><strong>Description:</strong> {{issue_description}}</p>
        </div>

        <p style="text-align: center;">
          <a href="{{issue_url}}" class="button">View Issue Details</a>
        </p>

        <p>Please address this issue as soon as possible.</p>

        <p style="margin-top: 30px;">
          Best regards,<br>
          {{company_name}} System
        </p>
      </div>
      <div class="footer">
        <p>This is an automated alert. Please do not reply to this email.</p>
      </div>
    </div>
  </body>
</html>',
updated_at = now()
WHERE template_type = 'issue_alert';

-- Update daily_summary template
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
        background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
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
      .stat-box {
        background: #f3f4f6;
        padding: 15px;
        border-left: 4px solid #4f46e5;
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
        .stat-box {
          background: #374151;
          border-left-color: #818cf8;
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
        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">Daily Summary Report</h1>
        <p style="margin: 10px 0 0 0; color: #ffffff;">{{report_date}}</p>
      </div>
      <div class="content">
        <p>Hello {{user_name}},</p>

        <p>Here''s your daily summary of activities:</p>

        <div class="stat-box">
          <p style="margin: 0;"><strong>New Leads:</strong> {{new_leads}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Proposals Sent:</strong> {{proposals_sent}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Work Orders Completed:</strong> {{work_orders_completed}}</p>
          <p style="margin: 10px 0 0 0;"><strong>Tasks Due:</strong> {{tasks_due}}</p>
        </div>

        <p>{{summary_notes}}</p>

        <p style="margin-top: 30px;">
          Have a great day!<br>
          {{company_name}}
        </p>
      </div>
      <div class="footer">
        <p>This is an automated summary. Please do not reply to this email.</p>
      </div>
    </div>
  </body>
</html>',
updated_at = now()
WHERE template_type = 'daily_summary';
