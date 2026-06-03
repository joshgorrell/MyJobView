/*
  # Add Review Request Email Template

  Adds the missing review_request template type to the email_templates table.
  This template is used when sending Google review requests to customers.
*/

INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'review_request',
  'We''d Love Your Feedback! - {{company_name}}',
  '⭐ **We''d Love Your Feedback!** ⭐

Hi {{customer_name}},

Thank you for choosing {{company_name}}! We hope you''re thrilled with the service we provided.

Your feedback helps us improve and helps others find quality service. Would you take a moment to share your experience on Google?

**Leave Your Review:**
{{review_url}}

It only takes a minute, and it means the world to us!

Thank you for being a valued customer!

Best regards,
{{company_name}}',
  true
)
ON CONFLICT (template_type) DO NOTHING;
