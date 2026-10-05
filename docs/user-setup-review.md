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

Apply `20261001201849_user_setup_reviews.sql` and `20261002013350_fix_employee_config_nullable_record_checks.sql` before deploying the frontend. No edge-function deployment is required. Notification and additional create permission values are saved on the created profile before classification and final review completion.

Verification found two defects and this PR fixes them:

- React could reuse the last Continue button as the Create submit button during the same click, submitting before a deliberate creation action. Continue now prevents the default click action, and the two buttons have separate keys. The browser regression verifies zero create requests on reaching Review.
- The existing payroll RPC checked a nullable composite record with `IS NOT NULL`. Because payroll configuration rows contain NULL fields, that check failed to close the previous configuration and the replacement insert violated the unique open-configuration constraint. The new migration checks the record ID explicitly. The regression reproduces the old unique-constraint failure, then verifies the fix, retained historical hours and future effective dates.

Automated checks pass:

- `npm run test:user-setup`: review RLS and tenant isolation, inactive administrator denial, section validation, setup fields, notification defaults, password exclusion, real classification/payroll RPCs in an isolated PostgreSQL runtime, idempotent classification and future-dated configuration/history.
- `npm run test:user-setup:browser`: Chromium runtime checks against fixture services: all tabs, required review, no premature creation, employee creation and notification payloads, future-dated employee edit payloads, printing, and iPhone-width navigation without horizontal overflow.
- Production build passes. Repository-wide TypeScript checking still reports existing errors elsewhere; changed user-management components report no errors.
- Desktop, mobile and print screenshots were inspected. The generated PDF is one Letter page; the print fixture includes five departments and forty modules, with bounds checks verifying all printed text stays on the page.

The browser suite needs Playwright's Chromium (`npx playwright install chromium`), or an existing binary supplied with `CHROMIUM_EXECUTABLE_PATH`. `USER_SETUP_SCREENSHOT_DIR` optionally saves QA screenshots/PDFs. `USER_SETUP_PLAYWRIGHT_MODULE` is an optional module-location override for managed environments. Fixtures use fictional employee data and no live credentials, accounts or payroll records.

After deployment, check employee/non-employee creation and print/PDF output with actual company configuration. Automated regression coverage exercises the existing database functions and frontend payloads separately without mutating live employee data.
