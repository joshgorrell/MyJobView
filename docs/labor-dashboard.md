# External labor dashboard

The Labor dashboard lives in **Time & Payroll** and at `/labor-dashboard`. It is available to active organization administrators. A single date selector controls the technician ranking, click-through history and project snapshot. Ranking switches between matched payroll/job efficiency and job-hour volume.

## Calculation and source rules

- External reports are observations in `external_labor_snapshots`; they never create native job punches, daily-clock punches or payable payroll segments. `labor_import_batches` preserves each distinct correction.
- Technician mappings use an existing profile ID plus the provider's stable employee identity. An active reporting roster is separate from employment history. Missing employees are not synthesized as zero-hour records.
- Effective-dated employee payroll configurations determine salary versus hourly treatment. Salary availability uses expected weekly hours divided by configured workdays, reduced by recorded leave and configured company holidays. These values are labeled assumptions; actual provider punches remain unchanged. Available hours stay unknown when provider leave coverage is missing. Before-hire dates and future dates are excluded.
- Efficiency is the ratio of verified matched job hours to available payroll work hours. Unreconciled, unknown, open or missing source entries stay visible and are excluded from percentages. A full leave day does not produce an absence warning; routine weekends do not produce missing-coverage warnings. Legitimate weekend work remains in history.
- Projects use one latest parent-order snapshot as of the selected completed period. Cumulative snapshots are never added together. Completion stays unknown unless supplied. Final bid assessment appears only for explicitly completed projects and uses a labeled ±5% tolerance.
- Each source has independent `enabled` and `native_from` controls. Disabling a source preserves imported history. A cutover chooses native data for that source/date; it never adds native and external hours together. Configure native employee clock/allocation requirements and verify native records before choosing a cutover.

## Sync and credentials

The existing owner-private Electronic Life Site remains operational independently. Its report and payroll save endpoints mirror successfully verified observations into the `labor-dashboard-ingest` Edge Function. Source-save success does not depend on MJV availability. A durable Site queue retains failed mirrors, with an authenticated private `/api/mjv-sync` endpoint for retries and backfill. The existing weekday updater also rechecks a seven-day correction window and reads the mirror status; it reports each dashboard's status separately.

The Edge Function implements custom bearer authentication. Its SHA-256 credential lookup binds the caller to one organization; request-body organization IDs do not grant authority. The credential table is unavailable to anonymous/authenticated clients, and ingestion is executable only by the service role. The plaintext integration key exists only as a backend Site secret. No provider token is copied into MJV or browser code. The integration URL is restricted to the configured MJV endpoint.

Imports are atomic, idempotent and read back before acknowledgement. A delayed older observation cannot replace a newer correction. Disabled sources and explicit cutover dates intentionally skip new observations. Turning integrations back on requires a verified backfill for any deliberately skipped interval.

## Rollout and validation

The additive storage migrations, custom-authenticated Edge Function, reporting identities/configurations and historical mirror were installed in the connected MJV database on October 13, 2026. Native time-entry, daily-clock and payroll-segment counts did not change during backfill. All mirrored source payload hashes were independently reconciled, including retained review flags. The standalone Site's history was verified unchanged.

The frontend still needs publication through the existing MJV Bolt/Netlify workflow after this source is merged. Backend installation does not prove frontend publication. Verify the `/labor-dashboard` route while signed in as an administrator after publication; check that a staff/non-admin account cannot read the RPC or credential table. The browser verification attempt was unavailable, so no live UI success is claimed here.

Checks: `npm run test:labor-dashboard`, `node tests/navigation/workspace-routes.mjs`, `node tests/workspace-consolidation/runtime.mjs`, and `npm run build`. The repository-wide typecheck has existing unrelated failures; new dashboard files must not add diagnostics. The existing employee-time regression suite currently stops at its missing `NotesPolishButton` fixture, after its database and integration checks pass.

The live payroll generator already uses profile IDs correctly. This change intentionally preserves that contract. The legacy Daily Clock CSV importer now uses `organization_id` and `primary_office_id`, and import profiles/history distinguish new daily-time and job-time files while retaining historical profiles as `legacy`.

Company holidays must be explicitly configured in Data sources. Recurring delivery of fresh project reports must be verified independently; keep the actual report as-of date visible when a newer valid report has not arrived.
