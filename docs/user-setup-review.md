# Admin user setup redesign

## Audit and field destinations

The old Edit User screen had Details, Department Access and Employee Info. Details combined identity, roles, office assignments, profile-level permissions, notification switches, visibility scopes, travel bonus, sales quota dates and password reset. New User was a separate long form with duplicated settings. The employee's own Settings screen additionally exposed six event notification preferences that admins could not review here.

| Destination | Existing fields / behavior |
| --- | --- |
| Profile | Full name, first/last name, username, login email |
| Access & Employment | Role, office assignments, password creation/reset; employee classification, employee number, hire date and existing employment status/termination controls |
| Permissions | Profile permission switches, proposal/discussion visibility, department role defaults and overrides; existing-user module defaults and overrides |
| Notifications | Lead email and Lost Opportunity response delivery; existing mention, assignment, fishbowl, escalation, lead status and product request preferences from My Settings |
| Pay & Time | Compensation type, payroll basis, daily clock, allocation, work schedule, expected hours, pay schedule, overtime/PTO eligibility, travel bonus; existing effective-date behavior |
| Sales | Sales representative business designation and existing-user sales start date; company Sales Targets remains a link to its existing settings page |
| Review / User Card | Shared summary of configured values, including enabled/disabled permissions and department/module overrides; Print / Save as PDF |

No dealer-wide configuration is copied into user settings. Device push registration remains employee/device-specific. The sales representative flag is a business designation, not a permission. Notification preferences do not grant access to records.

## Setup review behavior

New User requires an explicit Review & Continue for each section, validates name/email/password/role/department access/classification and employee hire date/pay schedule, and enables Create User only after all six sections are reviewed. Returning to a section and changing a field invalidates that section; role changes additionally invalidate Permissions. Existing-user editing is unrestricted by wizard navigation, with explicit reviewed checkboxes. Saving retains the existing classification/payroll RPCs. User list status opens Edit User and exposes outstanding review sections in its tooltip. Old users are not automatically marked complete.

Drafts are scoped to the signed-in administrator and this browser session, exclude passwords, restore configuration for review, and clear after successful creation. Draft review marks are intentionally not restored. If account creation succeeds but a later setup operation fails, another creation attempt is disabled; finish the created account in Edit User.

Review metadata is stored separately in `user_setup_reviews`, accessible only to active admins for users in the same organization. It does not authorize access or payroll. Existing department/module switches retain their immediate-save behavior; changing them invalidates persisted Permissions review before mutation. Other fields continue to save with Save Changes.

## Deployment and checks

Apply `20261001201849_user_setup_reviews.sql` before deploying the frontend. No edge-function deployment is required. Notification and additional create permission values are saved on the created profile before classification and final review completion. This PR does not modify payroll calculation rules or permission evaluation.

Automated coverage: review RLS/tenant isolation, inactive admin denial, allowed section keys, field validation, notification defaults, card content/password exclusion. DOM runtime checks exercised guided navigation, review-gated creation, single creation, all edit tabs and shared notification controls against stubbed services. Production build passes. Repository-wide TypeScript checking still reports existing errors elsewhere; the changed user-management components have no reported TypeScript errors.

A full browser was unavailable in the execution environment (Chromium download failed), so the following visual and live integration checks remain:

- Review desktop and narrow/mobile tab navigation, spacing, readable colors and scrolling.
- Print representative employees with many module overrides to Letter paper; confirm one page, readable text and no clipping. Test Save as PDF in Chrome/Edge.
- Create employee and non-employee users in a test dealer. Confirm saved profile notification values, role/office assignments, department overrides and creation confirmation.
- Edit an employee payroll configuration with a future effective date and verify historical/current payroll behavior. The existing effective-date RPC is retained.
- Reopen saved users, verify setup health, invalidate a review by changing settings, and verify failures display an error rather than saving unloaded defaults.
- Confirm administrator-scoped session drafts restore preferences/office assignments and require password re-entry.
