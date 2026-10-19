# Customer email consistency rollout

## Approved experience
Employee-initiated emails with an existing preview should offer **Edit** within that preview, followed by another preview and **Send**. Default subject/body should be ready to send. Edits apply to the current outgoing message only; they must not overwrite `email_templates`. Existing optional notes, attachments, recipient controls, and custom message editors remain available. Do not add a new settings page.

## Brand contract
Use the sending organization's name, configured logo (or text name fallback), sender identity, typography, CTA style, and footer. Never fall back to another tenant's logo. Keep mandatory action links, amounts, dates, and compliance text outside freely editable fields. Keep user-entered text escaped/sanitized before HTML rendering. The preview must match the delivered HTML.

## Initial audit targets
- Proposal and change-order messages: identify current preview/editor and preserve proposal/action links.
- Invoice, deposit and payment reminders: preserve invoice/payment links and monetary figures.
- Punchlist invitation and Test & Tune / VIP messages: inspect custom HTML builders as well as shared wrapper.
- Work-order reminders and satisfaction surveys: distinguish automated from manually initiated messages.
- Welcome/authentication and other automated notifications: use brand shell without introducing a manual editing step.

## Existing shared infrastructure
- `supabase/functions/_shared/emailTemplates.ts` supplies `getEmailTemplate`, `getCompanySettings`, `convertTextToHtml`, and `wrapInEmailLayout`.
- `supabase/functions/_shared/system-email.ts` sends via Resend.
- Individual edge functions may build their own HTML; changing the shared helper alone does **not** update already deployed functions.

## Release gates
1. Inventory every employee-visible preview and sending endpoint; identify its template, sender, and required noneditable data.
2. Add or reuse an Edit action **inside each existing preview**. Preview edits locally; only persist on explicit Send. Do not change defaults.
3. Consolidate layout calls without flattening custom content or dropping required links.
4. Verify at least one send/preview test for each email category, including org A / org B branding isolation, empty-logo fallback, mobile width, HTML escaping, and canceled edits.
5. Deploy edge functions deliberately with their shared dependencies; do not automatically enable Punchlist expiration reminders.
