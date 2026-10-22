# Unified customer proposal experience — implementation guardrails

Status: implementation in progress; **do not merge until end-to-end tests pass**.

## Non-regression requirements
- Preserve all existing proposal templates, settings, document attachments, PDFs, acceptance methods (including purchase orders), signature requirements, deposit rules, invoice workflows, revisions, expiration/reactivation, Q&A, and Lost Opportunities automations.
- Use one customer-facing proposal viewer for emailed share links and portal links, with consistent branding, scope, pricing, and actions on desktop, iPad, and iPhone.
- Do not expose private proposal content by replacing token access with an unauthenticated database query. Verify authorization for all decision mutations server-side.
- Do not conflate acceptance with payment. Accepted proposal remains approved if customer chooses to pay later or checkout fails. Track deposit separately.
- Decline must collect a reason and use the canonical loss-feedback workflow, preserving existing follow-up suppression and manual entry.
- Request changes must preserve messages and mark a formal follow-up state without mutating accepted versions.
- Resolve the actual customer-owning sales rep, not necessarily proposal.created_by. Notify that rep for approval, decline, and changes; provide click-to-call and click-to-email.
- Keep proposal history and immutable accepted version evidence. Make submissions idempotent.

## Confirmed code audit findings (2026-10-22)
- `src/components/Portal/SharedProposalPage.tsx` is currently read-only and does not render the full scope or actions.
- `src/components/Portal/PortalProposalDetail.tsx` contains approve/decline/change buttons, with inline change and decline sections.
- Its change handler inserts a message but does not change proposal status.
- Its decline handler directly updates `proposals`, whereas `src/components/Proposals/DeclineProposalModal.tsx` invokes `record_proposal_decline`.
- `src/components/Portal/ProposalApprovalModal.tsx` updates status to approved and supports deposit invoices, but deposit-required copy implies payment is needed to finalize approval.
- Customer proposal detail has no observed `tel:` or `mailto:` rep links.

## Delivery sequence
1. Trace share-link token security, portal routing, RLS and notification/payment triggers.
2. Introduce shared viewer without weakening access controls or removing existing PDF/theme capabilities.
3. Centralize decision mutations and state transitions, including loss feedback and change-request tracking.
4. Separate deposit checkout from acceptance and add deposit-later follow-up.
5. Add assigned-rep contact actions and verified notifications.
6. Polish iPhone-first action area and responsive scope sections; keep identical labels and sequence on all devices.
7. Test email share link and portal paths on iPhone Safari, iPad Safari, desktop Chrome/Safari/Edge; exercise approval with deposit now/later, declined payment, decline reasons, request changes, versioning, expired links, and duplicate clicks.

## Merge gate
No merge until the full proposal can be reviewed and acted on through both link types, all prior acceptance and template functionality remains intact, server-side authorization is verified, and regression tests pass.
