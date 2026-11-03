# Review queue integration contract

Place Smart Intake in the existing Service Command Center, not a new top-level page.

Show: channel, sender, subject/summary, priority, received time, missing information, suggested match, last follow-up and current status.

Actions: inspect conversation and attachments, link existing contact, request information, assign staff, convert through established service/lead creation, dismiss with reason, reopen.

All actions require authenticated employee membership and organization-scoped RLS. The current review-queue helper must not be called from a privileged client without verifying membership.

Never hide failed or incomplete intake items. Urgent unclassified requests must appear immediately.
