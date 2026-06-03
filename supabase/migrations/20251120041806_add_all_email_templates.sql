/*
  # Add All Email Templates

  ## Summary
  Adds 11 new email template types to the system, covering all email communications
  from user management to customer portal, sales, service, and admin notifications.

  ## New Templates Added

  ### User Management (1 new)
  - password_reset: Password reset request emails

  ### Customer Portal / MyJobView (4 new)
  - portal_magic_link: Portal login magic link emails
  - proposal_sent: Proposal shared with customer emails
  - invoice_sent: Invoice sent to customer emails
  - punchlist_invite: Test & Tune punchlist access invitation

  ### Lead & Sales (2 new)
  - lead_notification: New lead assignment notifications
  - appointment_reminder: Upcoming appointment reminders

  ### Service & Production (2 new)
  - work_order_assigned: Technician job assignment notifications
  - service_request_update: Customer service status updates

  ### Admin Notifications (2 new)
  - daily_summary: End-of-day management reports
  - issue_alert: Critical issue/bug notifications

  ## Template Features
  - All templates support dynamic placeholders
  - Default content provided for each template type
  - All templates active by default
  - Fully customizable by admins through UI
*/

-- Password Reset Email
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'password_reset',
  'Reset Your Password - {{company_name}}',
  'Hi {{full_name}},

We received a request to reset your password for your {{company_name}} account.

Click the link below to reset your password:
{{reset_link}}

This link will expire in 1 hour for security reasons.

If you didn''t request this password reset, please ignore this email and your password will remain unchanged.

For security reasons, never share your password with anyone.

Best regards,
The {{company_name}} Team',
  true
)
ON CONFLICT (template_type) DO NOTHING;

-- Portal Magic Link Email
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'portal_magic_link',
  'Your {{company_name}} Portal Access Link',
  'Hi {{customer_name}},

Click the secure link below to access your {{company_name}} customer portal:

{{magic_link}}

This link will expire in 1 hour for security reasons.

Through your portal, you can:
• View your projects and appointments
• Review proposals and invoices
• Submit punchlist items
• Communicate with our team
• Track service requests

If you have any questions, please don''t hesitate to contact us.

Best regards,
The {{company_name}} Team',
  true
)
ON CONFLICT (template_type) DO NOTHING;

-- Proposal Sent Email
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'proposal_sent',
  'New Proposal from {{company_name}} - {{proposal_number}}',
  'Hi {{customer_name}},

We''re excited to share a new proposal with you!

**Proposal:** {{proposal_number}}
**Project:** {{project_name}}
**Total Investment:** {{proposal_total}}

You can review the full proposal details by logging into your customer portal:
{{portal_link}}

Our proposal includes:
• Detailed scope of work
• Itemized pricing
• Product specifications
• Project timeline

We''re here to answer any questions you may have. Feel free to reach out to your sales representative {{sales_rep_name}} at {{sales_rep_email}} or {{sales_rep_phone}}.

We look forward to working with you!

Best regards,
{{sales_rep_name}}
{{company_name}}',
  true
)
ON CONFLICT (template_type) DO NOTHING;

-- Invoice Sent Email
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'invoice_sent',
  'Invoice {{invoice_number}} from {{company_name}}',
  'Hi {{customer_name}},

Thank you for your business! Your invoice is ready.

**Invoice Number:** {{invoice_number}}
**Invoice Date:** {{invoice_date}}
**Amount Due:** {{amount_due}}
**Due Date:** {{due_date}}

You can view and pay your invoice through your customer portal:
{{portal_link}}

Payment methods accepted:
• Credit/Debit Card
• ACH Bank Transfer
• Check (mail to address below)

If you have any questions about this invoice, please contact us at {{company_phone}} or {{company_email}}.

Thank you for choosing {{company_name}}!

Best regards,
The {{company_name}} Team

{{company_address}}',
  true
)
ON CONFLICT (template_type) DO NOTHING;

-- Punchlist Invite Email
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'punchlist_invite',
  'Welcome to Test & Tune - {{company_name}}',
  'Hi {{customer_name}},

Congratulations on the completion of your project with {{company_name}}!

We''re pleased to invite you to our **90-Day Test & Tune Program**. This exclusive program gives you:

✓ 90 days of complimentary access
✓ Easy punchlist item submission
✓ Photo documentation support
✓ Real-time status tracking
✓ Direct communication with our team

**Access Your Portal:**
{{portal_link}}

**Your Project:** {{project_name}}
**Access Expires:** {{expiration_date}}

During these 90 days, please test everything and let us know if you notice any issues. We want to ensure everything is perfect before your warranty period begins.

How to submit a punchlist item:
1. Log into your portal
2. Navigate to the Punchlist section
3. Add item with description and photos
4. Our team will review and schedule repairs

Thank you for choosing {{company_name}}. We''re committed to your complete satisfaction!

Best regards,
The {{company_name}} Team',
  true
)
ON CONFLICT (template_type) DO NOTHING;

-- Lead Notification Email
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'lead_notification',
  'New Lead Assigned: {{lead_name}}',
  'Hi {{sales_rep_name}},

You have been assigned a new lead!

**Lead Details:**
• Name: {{lead_name}}
• Company: {{lead_company}}
• Email: {{lead_email}}
• Phone: {{lead_phone}}
• Source: {{lead_source}}
• Priority: {{lead_priority}}

**Lead Notes:**
{{lead_notes}}

**Next Steps:**
1. Review lead details in the system
2. Contact the lead within 24 hours
3. Update lead status after contact
4. Add notes about your conversation

Log in to view full lead details and update status:
{{app_link}}

Remember: Fast response times significantly improve conversion rates!

Best regards,
{{company_name}} Sales Team',
  true
)
ON CONFLICT (template_type) DO NOTHING;

-- Appointment Reminder Email
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'appointment_reminder',
  'Appointment Reminder - {{company_name}}',
  'Hi {{customer_name}},

This is a friendly reminder about your upcoming appointment with {{company_name}}.

**Appointment Details:**
• Date: {{appointment_date}}
• Time: {{appointment_time}}
• Duration: {{appointment_duration}}
• Type: {{appointment_type}}
• Location: {{appointment_location}}

**Team Member:** {{staff_name}}
{{staff_phone}}

**What to Expect:**
{{appointment_notes}}

**Need to Reschedule?**
Please contact us at least 24 hours in advance:
• Phone: {{company_phone}}
• Email: {{company_email}}
• Portal: {{portal_link}}

We look forward to seeing you!

Best regards,
The {{company_name}} Team',
  true
)
ON CONFLICT (template_type) DO NOTHING;

-- Work Order Assigned Email
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'work_order_assigned',
  'New Work Order Assigned - {{work_order_number}}',
  'Hi {{technician_name}},

You have been assigned a new work order.

**Work Order:** {{work_order_number}}
**Project:** {{project_name}}
**Customer:** {{customer_name}}
**Priority:** {{priority_level}}

**Schedule:**
• Date: {{scheduled_date}}
• Start Time: {{start_time}}
• Estimated Duration: {{estimated_hours}} hours

**Location:**
{{job_address}}
{{map_link}}

**Scope of Work:**
{{work_description}}

**Special Instructions:**
{{special_instructions}}

**Before You Start:**
☐ Review job details in the app
☐ Check for required parts/materials
☐ Confirm you have necessary tools
☐ Clock in when arriving on site
☐ Take before photos

Log in to view complete details and accept the job:
{{app_link}}

Questions? Contact your supervisor or dispatch.

Stay safe!
{{company_name}} Production Team',
  true
)
ON CONFLICT (template_type) DO NOTHING;

-- Service Request Update Email
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'service_request_update',
  'Service Request Update - {{service_request_number}}',
  'Hi {{customer_name}},

We have an update on your service request.

**Service Request:** {{service_request_number}}
**Status:** {{new_status}}
**Updated:** {{update_date}}

**Update Details:**
{{update_message}}

**Current Status:**
{{status_description}}

**Next Steps:**
{{next_steps}}

**Estimated Completion:**
{{estimated_completion}}

You can track your service request in real-time through your customer portal:
{{portal_link}}

If you have any questions or concerns, please don''t hesitate to contact us:
• Phone: {{company_phone}}
• Email: {{company_email}}

Thank you for your patience!

Best regards,
The {{company_name}} Service Team',
  true
)
ON CONFLICT (template_type) DO NOTHING;

-- Daily Summary Email
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'daily_summary',
  'Daily Summary Report - {{report_date}}',
  'Hi {{manager_name}},

Here''s your daily summary for {{report_date}}.

**SALES ACTIVITY**
• New Leads: {{new_leads_count}}
• Proposals Sent: {{proposals_sent_count}}
• Proposals Won: {{proposals_won_count}}
• Total Revenue: {{daily_revenue}}

**PRODUCTION STATUS**
• Jobs Completed: {{jobs_completed_count}}
• Jobs In Progress: {{jobs_in_progress_count}}
• Jobs Scheduled: {{jobs_scheduled_count}}
• Average Completion Time: {{avg_completion_time}}

**SERVICE REQUESTS**
• New Requests: {{new_requests_count}}
• Resolved Today: {{resolved_requests_count}}
• Pending: {{pending_requests_count}}
• Average Response Time: {{avg_response_time}}

**TEAM PERFORMANCE**
• Total Clock Hours: {{total_clock_hours}}
• Technicians Active: {{active_technicians_count}}
• Top Performer: {{top_performer_name}} ({{top_performer_metric}})

**CUSTOMER ACTIVITY**
• New Customers: {{new_customers_count}}
• Portal Logins: {{portal_logins_count}}
• Punchlist Items: {{punchlist_items_count}}

**ACTION ITEMS**
{{action_items}}

**ALERTS & ISSUES**
{{alerts_summary}}

View detailed reports in the system:
{{app_link}}

Best regards,
{{company_name}} System',
  true
)
ON CONFLICT (template_type) DO NOTHING;

-- Issue Alert Email
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'issue_alert',
  '🚨 Critical Issue Reported - {{issue_number}}',
  'Hi {{admin_name}},

A critical issue has been reported in the system.

**Issue:** {{issue_number}}
**Severity:** {{severity_level}}
**Reported By:** {{reporter_name}}
**Reported At:** {{reported_date}}

**Issue Type:** {{issue_type}}

**Description:**
{{issue_description}}

**Affected Area:**
{{affected_area}}

**Steps to Reproduce:**
{{steps_to_reproduce}}

**Expected Behavior:**
{{expected_behavior}}

**Actual Behavior:**
{{actual_behavior}}

**Impact:**
{{impact_description}}

**Recommended Action:**
{{recommended_action}}

**User Environment:**
• Browser: {{user_browser}}
• Device: {{user_device}}
• Role: {{user_role}}

View full issue details and respond:
{{issue_link}}

**IMPORTANT:** Please acknowledge this alert and assign someone to investigate.

Best regards,
{{company_name}} System',
  true
)
ON CONFLICT (template_type) DO NOTHING;
