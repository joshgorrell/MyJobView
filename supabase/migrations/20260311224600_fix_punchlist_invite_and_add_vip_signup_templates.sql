/*
  # Fix Punchlist Invite & Add VIP Signup Email Templates

  ## Summary
  Two email templates needed correction:

  1. **punchlist_invite** — The body stored in the database was old raw HTML from the original
     generic migration. It used an outdated placeholder ({{invite_url}}), a green-gradient header,
     and generic copy that didn't match the polished verbiage used by the other three punchlist
     templates. This migration replaces that body with clean plain-text verbiage matching the tone
     and style of punchlist_promotional, punchlist_test_and_tune, and punchlist_test_and_tune_no_portal.
     The subject line is also updated to match the consistent format used by the other templates.

  2. **vip_signup** — This template row did not exist in the database at all. The edge function
     (send-punchlist-invite) was falling back entirely to hardcoded HTML. This migration inserts
     the vip_signup template with proper plain-text verbiage and the {{signup_link}} placeholder
     so it renders through the shared wrapInEmailLayout() helper just like the others.

  ## Changes

  ### Modified Tables
  - `email_templates`
    - UPDATE: punchlist_invite — new subject and plain-text body with {{portal_link}} placeholder
    - INSERT: vip_signup — new row with subject and plain-text body with {{signup_link}} placeholder

  ## Notes
  - All four punchlist invite email types now use consistent plain-text bodies processed through
    the shared convertTextToHtml() and wrapInEmailLayout() helpers in the edge function.
  - Placeholders used: {{customer_name}}, {{company_name}}, {{portal_link}}, {{signup_link}}
*/

-- Fix the punchlist_invite template (was old raw HTML with wrong placeholder)
UPDATE email_templates
SET
  subject = 'Experience Our VIP Customer Portal — {{company_name}}',
  body = 'Hi {{customer_name}},

At {{company_name}}, we''re always looking for ways to make supporting your technology easier, faster, and more personalized.

As part of a special promotion, we''d like to invite you to experience our VIP Customer Portal with complimentary access for 90 days.

The portal gives you a direct line to our team and a simple way to manage anything related to your system. Through the portal you can:

- Create punch-list tasks
- Request service or adjustments
- Send messages directly to our support team
- Track the progress of requests and updates

Many of our clients find the portal to be the easiest way to keep their systems running exactly the way they want, while staying connected with our team.

Access Your VIP Portal:
{{portal_link}}

After the 90-day promotional access, you''ll have the option to continue using the VIP Customer Portal through an optional subscription if you find it valuable.

We''d love for you to experience the convenience and support it provides.

{{company_name}}',
  updated_at = now()
WHERE template_type = 'punchlist_invite';

-- Add the vip_signup template (was missing from database entirely)
-- Use the same organization_id as existing punchlist templates
INSERT INTO email_templates (template_type, subject, body, is_active, organization_id)
SELECT
  'vip_signup',
  'Access the {{company_name}} VIP Customer Portal',
  'Hi {{customer_name}},

At {{company_name}}, we offer our VIP Customer Portal as the easiest way to stay connected with our team and manage service requests for your system.

The portal provides a direct and organized way to communicate with us and keep everything related to your technology in one place.

Through the VIP Portal you can:

- Submit service requests and punch-list items
- Message our support team directly
- Track the status of your requests
- Keep notes and updates about your system organized

Access to the VIP Customer Portal is available through a subscription service for clients who would like a more streamlined and responsive support experience.

If you''d like to activate your access, simply use the link below.

Activate VIP Portal Access:
{{signup_link}}

We appreciate the opportunity to support your system whenever you need us.

{{company_name}}',
  true,
  organization_id
FROM email_templates
WHERE template_type = 'punchlist_test_and_tune'
LIMIT 1
ON CONFLICT (template_type) DO UPDATE
SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = now();
