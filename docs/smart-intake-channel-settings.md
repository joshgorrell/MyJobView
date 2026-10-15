# Smart Intake: Dealer channel settings

Each dealer may independently enable email intake, SMS/MMS intake, both, or neither. Email-only is the recommended first rollout and must not require Twilio or another SMS provider.

## Settings
- `email_intake_enabled`: boolean, default false until address verified and activated.
- `sms_intake_enabled`: boolean, default false until provider and number verified.
- `email_intake_address`: unique verified recipient address, nullable.
- `sms_intake_number`: unique verified E.164 number, nullable.
- `sms_provider`: nullable; no provider credentials needed for email-only dealers.

Settings should live within existing dealer communications/settings UI, not a new top-level page. Intake destinations remain the routing authority, with an enabled flag per channel and organization.

## Operational rules
1. Email and SMS use the same intake items, AI processing, matching, exception queue, and audit trail.
2. Enabling email must not initialize, bill, or require an SMS provider.
3. Enabling SMS requires verified provider credentials, webhook authentication, number ownership, and opt-out handling before activation.
4. Disabling a channel stops new inbound intake from that channel but preserves history and pending cases for staff review. Do not silently drop provider events; return an explicit rejection and log operationally.
5. Existing customer contact records are never created solely to enable either channel.
6. Dealer admins can configure channels independently; settings changes are audited.
7. Future SMS/MMS support must be additive and should not change the email-only intake contract.

## Launch recommendation
Phase 1: email intake only, with attachments and forwarded employee messages. Phase 2: opt-in SMS/MMS per dealer when ready.
