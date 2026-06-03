/*
  # Add Job Completion Survey Email Template

  ## Summary
  Inserts a new email template of type `job_completion_survey` into the email_templates table.

  ## New Template
  - **Type:** job_completion_survey
  - **Subject:** How did we do, {{customer_first_name}}?
  - **Purpose:** Sent after a job is completed to ask the customer for a Google review
  - **Tone:** Warm, personal, longer-form than the standard short review request

  ## Placeholders
  - `{{customer_first_name}}` - Customer's first name
  - `{{company_name}}` - Company name
  - `{{review_url}}` - Google review URL
  - `{{company_website}}` - Company website URL (optional)

  ## Notes
  - Inserts for every organization that does not already have this template type
  - Uses INSERT ... ON CONFLICT DO NOTHING so re-running is safe
*/

INSERT INTO email_templates (template_type, subject, body, is_active, organization_id)
SELECT
  'job_completion_survey',
  'How did we do, {{customer_first_name}}?',
  'Hi {{customer_first_name}},

Thank you so much for choosing {{company_name}}! We truly value your business and hope your recent experience exceeded your expectations.

We''d love to hear how we did. Your feedback helps us improve our service and helps other homeowners and businesses find quality work they can trust.

Would you take just 2 minutes to share your experience on Google?

[Leave a Review Here!]({{review_url}})

It only takes a minute and means the world to our team.

Thank you again for trusting {{company_name}} with your project. We look forward to serving you again!

Warm regards,
The {{company_name}} Team

{{company_website}}',
  true,
  o.id
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates et
  WHERE et.template_type = 'job_completion_survey'
  AND et.organization_id = o.id
);
