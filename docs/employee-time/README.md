# Employee time authority

This branch puts the normal technician timer in the existing Work Order, removes card/header job starts, and adds a header Command Center with Today's Work, the existing personal calendar, and My Time. Work Order links always route with `workOrderId` to the canonical detail screen.

Effective-dated employee payroll configuration determines Daily Clock, approved work allocation, or salary. Job Time employees never get Daily Clock controls. Salary time remains operational job costing. Pending manual/internal requests do not create payable hours. Managers retain direct entry.

## Database changes

`20261002110037_enforce_employee_time_authority.sql` adds a manual project-time request table and atomic review RPC. Review supports Edit & Approve with an adjustment reason and an audit snapshot while preserving the original request. Review checks the employee's payroll schedule, rejects locked periods, serializes repeated approvals, and creates exactly one approved canonical entry. The same-organization manager must be someone other than the requester.

Time-entry and internal-session triggers enforce employee ownership, assigned Work Orders, review authority, effective classification, immutable approved time, and approved internal-session linkage even when another client calls the tables directly. Config, employee identity, legacy classification, and review-role changes require manager authority. Work Order starts are serialized per employee and idempotent. Former assignees can stop their own previously started Work Order timer after reassignment, while new starts remain restricted to the current assignee. Duration is computed from timestamps. Unique indexes prevent duplicate internal-session entries and multiple active employee allocations.

The existing calendar privacy RPC now binds its supplied user to the authenticated user and its tenant to the authenticated organization. Existing private-event masking remains. Personal calendar also includes approved internal sessions and approved PTO.

No migration or application deployment has been applied to production. Schema was checked read-only against MJV. Duplicate internal-session and multiple-active-entry preflight counts were zero when checked; repeat these checks immediately before applying the migration. Existing historical records are never silently deleted to satisfy indexes.

Internal review now uses one transactional RPC from both manager entry points. Approving a request schedules authorized work without creating future payable time. Completing a predetermined session records already-worked time and marks completion atomically; payroll approval remains separate. Repeat completion/review returns the existing record. A manager Requests & Travel tab reuses the existing manual/internal/travel queues and links to payroll exceptions.

## Validation

- `npm run build`: passed.
- `npm run test:employee-time`: PGlite migration/RLS tests and isolated component runtime tests passed. Covers tenant/ownership bypass, role/classification tampering, unapproved entries, locked periods, unrelated payroll schedules, immutable approval, repeated review, internal linkage, assigned/null-assigned Work Order starts, calendar spoofing/private masking, edited approval audit, rollback of a failed internal completion, future-work rejection, repeat completion/pay review, and disabled-manager denial with an existing access token. Runtime checks cover native effective configuration/HTTPS handoff and overnight corrections across UTC, Los Angeles and Auckland, including a 23-hour DST day.
- `npm run test:user-setup`: passed all existing database, runtime and payroll suites.
- `npm run typecheck`: the default Node heap was exhausted; the 8 GB retry reports existing repository-wide errors. This branch is not presented as a clean full-repository typecheck.
- `npm run test:employee-time:browser`: fixture-based 320px, 390px and desktop checks are included, but were not executed successfully here because Chromium was unavailable and the browser download returned invalid archives. Calendar data in this harness is mocked; it does not certify the full calendar layout.

## Staging and release work

1. No development branch was available on the connected project. Apply and test the migration in staging against all existing payroll/configuration triggers and canonical user-setup RPCs; PGlite uses a reduced schema and cannot replace this integration check. Run the duplicate preflight again. Review historical internal sessions without approver metadata before enforcing new employee starts.
2. Verify Daily Clock, Job Time and salary profiles on desktop and iPhone-sized browsers; test time zone/day boundaries, timer stop/completion, approved internal work and PTO, pending requests, manager approval and payroll reconciliation.
3. Native uses its effective configuration and opens the canonical web Work Order/Command Center through `company_settings.app_url`. Configure an HTTPS URL and verify iOS/Android devices. A browser login may be required. Full native layout parity and offline Work Order timer starts are not implemented.
4. Coordinate the Work Order completion/task handoff with draft PR #61, which changes overlapping screens. The existing shared clock-out/completion flow remains in use.
5. The request and travel queues now share an entry point, and period-specific payroll exceptions remain in their existing panels. Additional legacy screens and exports still need a complete timezone sweep; this update covers daily clock/PTO dates, correction inputs/displays, calendar filtering/reminders/selections, internal time displays and travel-log date filters.
