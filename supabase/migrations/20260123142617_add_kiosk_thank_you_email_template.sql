/*
  # Add Kiosk Thank You Email Template

  1. Changes
    - Add email template for thanking tradeshow/kiosk visitors
    - Template is editable by admins through the email templates UI

  2. Security
    - Template is accessible to all authenticated users
    - Only admins can edit templates (existing policy)
*/

-- Insert the kiosk thank you email template
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'kiosk_thank_you',
  'Thank You for Visiting Electronic Life!',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f9fafb;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .email-header {
      background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .email-header h1 {
      color: #ffffff;
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 700;
    }
    .email-header p {
      color: #e0f2fe;
      margin: 0;
      font-size: 16px;
    }
    .email-body {
      padding: 40px 30px;
    }
    .email-body h2 {
      color: #0891b2;
      font-size: 22px;
      margin: 0 0 20px 0;
      font-weight: 600;
    }
    .email-body p {
      margin: 0 0 16px 0;
      font-size: 16px;
      color: #374151;
    }
    .interests-list {
      background-color: #f0f9ff;
      border-left: 4px solid #0891b2;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .interests-list h3 {
      margin: 0 0 12px 0;
      color: #0891b2;
      font-size: 18px;
      font-weight: 600;
    }
    .interests-list ul {
      margin: 0;
      padding-left: 20px;
    }
    .interests-list li {
      margin: 6px 0;
      color: #1e40af;
      font-size: 15px;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
      color: #ffffff;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
      box-shadow: 0 4px 6px rgba(6, 182, 212, 0.3);
    }
    .email-footer {
      background-color: #f3f4f6;
      padding: 30px;
      text-align: center;
      font-size: 14px;
      color: #6b7280;
    }
    .email-footer p {
      margin: 8px 0;
    }
    .social-links {
      margin: 20px 0;
    }
    .social-links a {
      color: #0891b2;
      text-decoration: none;
      margin: 0 10px;
      font-weight: 500;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #111827;
      }
      .email-container {
        background-color: #1f2937;
      }
      .email-body p {
        color: #d1d5db;
      }
      .email-footer {
        background-color: #111827;
        color: #9ca3af;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>Thank You for Visiting Us!</h1>
      <p>We appreciate you stopping by our booth</p>
    </div>
    
    <div class="email-body">
      <p>Hi {{contact_name}},</p>
      
      <p>Thank you so much for taking the time to visit Electronic Life at the tradeshow! It was great meeting you and learning about your interests.</p>
      
      <div class="interests-list">
        <h3>You expressed interest in:</h3>
        {{interests_html}}
      </div>
      
      <p>One of our team members will be reaching out to you soon to discuss how we can help bring your vision to life. Whether it''s for your home or business, we''re here to create amazing experiences.</p>
      
      <p>In the meantime, feel free to explore our website or reach out if you have any immediate questions!</p>
      
      <center>
        <a href="{{company_website}}" class="cta-button">Visit Our Website</a>
      </center>
      
      <p style="margin-top: 30px;">Looking forward to working with you!</p>
      
      <p><strong>The Electronic Life Team</strong></p>
    </div>
    
    <div class="email-footer">
      <p><strong>Electronic Life</strong></p>
      <p>{{company_phone}}</p>
      <p>{{company_email}}</p>
      
      <div class="social-links">
        <a href="{{company_website}}">Website</a> |
        <a href="mailto:{{company_email}}">Email Us</a> |
        <a href="tel:{{company_phone}}">Call Us</a>
      </div>
      
      <p style="margin-top: 20px; font-size: 12px;">
        This email was sent because you visited our booth at a tradeshow.<br>
        If you have any questions, please don''t hesitate to reach out.
      </p>
    </div>
  </div>
</body>
</html>',
  true
)
ON CONFLICT (template_type) DO UPDATE
SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = now();
