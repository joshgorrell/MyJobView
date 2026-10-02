# Employee time authority

This branch puts the normal technician timer in the existing Work Order, removes card/header job starts, and adds a header Command Center with Today's Work, the existing personal calendar, and My Time. Work Order links always route with `workOrderId` to the canonical detail screen.

Effective-dated employee payroll configuration determines Daily Clock, approved work allocation, or salary. Job Time employees never get Daily Clock controls. Salary time remains operational job costing. Pending manual/internal requests do not create payable hours. Managers retain direct entry.

## Database changes

`20261002110037_enforce_employee_time_authority.sql` adds a manual project-time request table and atomic review RPC. Review supports Edit & Approve with an adjustment reason and an audit snapshot while preserving the original request. Review checks the employee's payroll schedule, rejects locked periods, serializes repeated approvals, and creates exactly one approved canonical entry. The same-organization manager must be someone other than the requester.

Time-entry and internal-session triggers enforce employee ownership, assigned Work Orders, review authority, effective classification, immutable approved time, and approved internal-session linkage even when another client calls the tables directly. Config, employee identity, legacy classification, and review-role changes require manager authority. Work Order starts are serialized per employee and idempotent. Former assignees can stop their own previously started Work Order timer after reassignment, while new starts remain restricted to the current assignee. Duration is computed from timestamps. Unique indexes prevent duplicate internal-session entries and multiple active employee allocations.

The existing calendar privacy RPC now binds its supplied user to the authenticated user and its tenant to the authenticated organization. Existing private-event masking remains. Personal calendar also includes approved internal sessions and approved PTO.

No migration or application deployment has been applied to production. Schema was checked read-only against MJV. Duplicate internal-session and multiple-active-entry preflight counts were zero when checked; repeat these checks immediately before applying the migration. Existing historical records are never silently deleted to satisfy indexes.

Internal review now uses one transactional RPC from both manager entry points. Approving a request schedules authorized work without creating future payable time. Completing a predetermined session records already-worked time and marks completion atomically; payroll approval remains separate. Repeat completion/review returns the existing record. A manager Requests & Travel tab reuses the existing manual/internal/travel queues and links to payroll exceptions.

Timer stops no longer offer Work Order completion; the canonical completion wizard requires stopping job time first. Offline stops remain visible as pending synchronization and block new starts until synchronized. The queue now preserves client IDs, orders writes by capture time, waits for durable queue transactions, checks server errors and zero-row writes, and holds dependent same-record actions after a failure. Lost creation acknowledgments can retry without duplicates only when the visible existing record matches the captured creation payload; conflicting records remain pending. New queued saves are bound to the signed-in account. Unowned legacy actions are retained for recovery review rather than being silently attributed to another account. Offline timer starts are still unsupported.

## Validation

- `npm run build`: passed.
- `npm run test:employee-time`: PGlite migration/RLS tests and isolated component runtime tests passed. Covers tenant/ownership bypass, role/classification tampering, unapproved entries, locked periods, unrelated payroll schedules, immutable approval, repeated review, internal linkage, assigned/null-assigned Work Order starts, calendar spoofing/private masking, edited approval audit, rollback of a failed internal completion, future-work rejection, repeat completion/pay review, and disabled-manager denial with an existing access token. Runtime checks cover native effective configuration/HTTPS handoff and overnight corrections across UTC, Los Angeles and Auckland, including a 23-hour DST day. Offline regression tests cover saved-stop UI, completion separation, preserved IDs, ordered writes, rejected and zero-row responses, account changes, legacy unowned actions and authorized retry.
- `npm run test:user-setup`: passed all existing database, runtime and payroll suites.
- `npm run typecheck`: the default Node heap was exhausted; the 8 GB retry reports existing repository-wide errors. This branch is not presented as a clean full-repository typecheck.
- `npm run test:employee-time:browser`: fixture-based 320px, 390px and desktop checks are included, but were not executed successfully here because Chromium was unavailable and the browser download returned invalid archives. Calendar data in this harness is mocked; it does not certify the full calendar layout.

## Staging and release work

1. No development branch was available on the connected project. Apply and test the migration in staging against all existing payroll/configuration triggers and canonical user-setup RPCs; PGlite uses a reduced schema and cannot replace this integration check. Run the duplicate preflight again. Review historical internal sessions without approver metadata before enforcing new employee starts.
2. Verify Daily Clock, Job Time and salary profiles on desktop and iPhone-sized browsers; test time zone/day boundaries, timer stop/completion, approved internal work and PTO, pending requests, manager approval and payroll reconciliation.
3. Native uses its effective configuration and opens the canonical web Work Order/Command Center through `company_settings.app_url`. Configure an HTTPS URL and verify iOS/Android devices. A browser login may be required. Full native layout parity and offline Work Order timer starts are not implemented.
4. Coordinate the Work Order completion/task handoff with draft PR #61, which changes overlapping screens. The existing shared clock-out/completion flow remains in use.
5. The request and travel queues now share an entry point, and period-specific payroll exceptions remain in their existing panels. Additional legacy screens and exports still need a complete timezone sweep; this update covers daily clock/PTO dates, correction inputs/displays, calendar filtering/reminders/selections, internal time displays and travel-log date filters.

### Clock-event GPS verification

Daily Clock and canonical Work Order starts/stops share `saveClockEventGps` on the web. It saves coordinates, accuracy, capture method, attempt time, actual device reading time, and duration. Failed/unsupported GPS attempts are recorded without blocking time saves. Offline evidence uses the account-owned durable queue; connectivity failures are queued even before the browser's online flag changes. Address lookup and quality scoring are optional network enrichment. Later moving positions no longer replace the original clock-event reading through background refinement.

Location is captured only on Daily Clock and Work Order clock-in/out. Clock flows never start GPS watches, pre-warming, periodic breadcrumbs, or refinement. Opening the site or native shell does not request background location. Native foreground permission is requested only when a clock action needs a reading. The browser/OS controls how long permission remains granted; MJV does not add a confirmation for every action. Native Daily Clock uses database-supported capture methods, records timestamps, rejects stale fallback readings, and does not start background tracking. Native Work Orders still hand off to the canonical web workflow.

`tests/employee-time/gps.mjs` verifies all four event destinations, actual timestamps, zero coordinates, denied permission without cached-location reuse, retired tracking APIs and absence of automatic GPS collection, durable offline metadata, network-loss queueing, and native fallback freshness. The live database capture-method constraints were checked read-only. Real GPS accuracy, permission prompts, mobile background execution, and end-to-end saved locations still need signed-in browser/iOS/Android device checks; local mocks do not certify hardware behavior.


### Existing-rule integration coverage

`integration.mjs` runs read-only 2026-10-02 snapshots of existing production triggers, including internal request and home-clock notifications, and the three employee-setup RPCs inside a local isolated database. It verifies canonical classification and effective-dated successor updates with the existing nullable-record fix, immutable historical configuration, Work Order scheduling permission and project inheritance, Daily Clock duration/status calculation, period transition restrictions, and manual approval across locked/reopened periods. It reproduces and blocks disabled-manager updates through the privileged setup RPC; employee/config row guards enforce active tenant-bound authority even when the caller bypasses RLS.

The nullable-record migration `20261002013350` must precede this migration: the live setup RPC still uses nullable composite-record existence checks and cannot correctly close an old config without that existing fix. This is an already checked-in user-setup migration, not a new payroll implementation. The read-only preflight on 2026-10-02 found zero duplicate internal entries, zero employees with multiple open allocations, and zero scheduled/active internal sessions missing approval metadata. Repeat preflight before applying migrations.

This local coverage does not include every production notification, travel-bonus, recurring-work, or event-capture trigger, nor hosted Supabase APIs. Full staging and signed-in device/browser checks remain required.


Internal request alerts now use organization-scoped settings and active authorized recipients. Approval notifications follow the pending-to-scheduled transition and describe authorized work, without claiming payroll hours were added. Completion and pay review do not emit duplicate request approval alerts. Home-clock alerts recognize the first delayed GPS coordinate save, retain tenant timezone formatting, and use one trigger to avoid duplicate notifications. The notification email function validates the signed-in active actor, tenant, permitted direction/status, and recipients before invoking its transport. Its regression test uses a mocked transport and sends no email. Deploying that Edge Function remains a separate release step; it has not been deployed here.


The local integration fixture also executes a read-only snapshot of the live travel-bonus trigger and distance helper. A work-allocation employee starts a Work Order with travel enabled and no Daily Clock, receives exactly one pending request, and retains one request on repeated start and subsequent stop. This verifies compatibility with the existing travel calculation; it does not replace the current distance policy with routing or GPS trails. Hosted APIs, complete schema/event integration, and signed-in device checks remain outstanding. A temporary hosted Supabase branch requires selecting its billing organization and confirming its quoted cost before creation; production has not been changed.
