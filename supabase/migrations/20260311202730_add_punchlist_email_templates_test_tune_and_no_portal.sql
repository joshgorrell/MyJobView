/*
  # Add Missing Punchlist Email Templates

  ## Summary
  Adds the three punchlist invite email templates that were previously hardcoded in the
  Edge Function, making them editable through the Admin > Email Templates UI.

  ## New Templates
  1. `punchlist_test_and_tune` - Test & Tune with portal access (90-day enrollment with portal CTA)
  2. `punchlist_test_and_tune_no_portal` - Test & Tune without portal access (no portal CTA)
  3. `punchlist_promotional` - Promotional/general punchlist invite (90-day free access offer)

  The existing `vip_signup` and `punchlist_invite` templates already exist in the database.

  ## Notes
  - All templates use plain text bodies with {{placeholder}} syntax
  - The Edge Function will fall back to hardcoded HTML if a template is not found
  - Templates are inserted per-organization using the existing organization_id
*/

INSERT INTO email_templates (template_type, subject, body, is_active, organization_id)
SELECT
  'punchlist_test_and_tune',
  'Welcome to Your 90-Day Test & Tune Experience — {{company_name}}',
  'Hi {{customer_name}},

Congratulations — your project is now substantially complete.

As part of our final commissioning process, your system is now in our 90-Day Test & Tune period, where we work with you to refine and optimize everything so it performs perfectly in your home or business. Adjustments, tuning, and support during this time are included at no additional charge.

You''ll also receive complimentary access to our Customer Portal during this period. The portal allows you to easily submit punch-list items, request adjustments, and communicate directly with our team so we can keep everything running exactly the way you want it.

Access Your Customer Portal:
{{portal_link}}

After the 90-day Test & Tune period, manufacturer warranties remain in effect, and you''ll have the option to continue using the Customer Portal through an optional subscription if you''d like ongoing access for service requests and support.

Thank you for choosing {{company_name}}. We look forward to helping you enjoy your system.',
  true,
  organization_id
FROM email_templates
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates e2
  WHERE e2.template_type = 'punchlist_test_and_tune'
  AND e2.organization_id = email_templates.organization_id
)
LIMIT 1;

INSERT INTO email_templates (template_type, subject, body, is_active, organization_id)
SELECT
  'punchlist_test_and_tune_no_portal',
  'Welcome to Your 90-Day Test & Tune Experience — {{company_name}}',
  'Hi {{customer_name}},

Congratulations — your project is now substantially complete.

As part of our final commissioning process, your system is now in our 90-Day Test & Tune period, where we work with you to refine and optimize everything so it performs perfectly in your home or business. Adjustments, tuning, and support during this time are included at no additional charge.

If something doesn''t feel quite right, or you''d like to make adjustments to how your system operates, simply reach out to our team and we''ll take care of it.

After the 90-day Test & Tune period, manufacturer warranties remain in effect for all applicable equipment.

Thank you for choosing {{company_name}}. We look forward to helping you enjoy your system.',
  true,
  organization_id
FROM email_templates
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates e2
  WHERE e2.template_type = 'punchlist_test_and_tune_no_portal'
  AND e2.organization_id = email_templates.organization_id
)
LIMIT 1;

INSERT INTO email_templates (template_type, subject, body, is_active, organization_id)
SELECT
  'punchlist_promotional',
  'Experience Our VIP Customer Portal — {{company_name}}',
  'Hi {{customer_name}},

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
  true,
  organization_id
FROM email_templates
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates e2
  WHERE e2.template_type = 'punchlist_promotional'
  AND e2.organization_id = email_templates.organization_id
)
LIMIT 1;
