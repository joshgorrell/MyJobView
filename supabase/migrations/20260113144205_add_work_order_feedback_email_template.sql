/*
  # Add Work Order Feedback Email Template

  Adds the work_order_feedback template type to the email_templates table.
  This template is used when a technician marks a work order as complete
  and opts to send a customer feedback request.

  Template placeholders:
  - {{customer_name}}: Customer's name
  - {{company_name}}: Company name from settings
  - {{work_order_number}}: Work order reference number
  - {{work_order_title}}: Brief description of work performed
  - {{completion_date}}: Date the work was completed
  - {{technician_names}}: Names of all technicians who worked on the job
  - {{company_phone}}: Company contact phone
*/

INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'work_order_feedback',
  'How did everything go? - {{company_name}}',
  'Hi {{customer_name}},

We wanted to follow up regarding the service we recently completed for you.

**Work Order:** {{work_order_number}}
**Service:** {{work_order_title}}
**Completed:** {{completion_date}}
**Technician(s):** {{technician_names}}

We hope everything went smoothly and you''re satisfied with the work performed. If you have any questions, concerns, or feedback about the service, we''d love to hear from you.

**Is everything working as expected?**
Please don''t hesitate to reach out if anything needs attention.

**Were you happy with our service?**
Your feedback helps us continue to provide excellent service to all our customers.

You can reach us at {{company_phone}} or simply reply to this email.

Thank you for choosing {{company_name}}!

Best regards,
The {{company_name}} Team',
  true
)
ON CONFLICT (template_type) DO NOTHING;