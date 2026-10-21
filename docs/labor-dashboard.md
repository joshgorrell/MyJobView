# External labor dashboard

Imported technician performance lives in the existing **Tech Stats → Performance** tab. It is available to active organization administrators; other staff retain the existing native activity view without gaining imported-payroll access. Native clocks/travel and advisor tools remain under **Native MJV activity & travel** on the same Tech Stats page. Legacy `/labor-dashboard` links open that same Tech Stats entry; the duplicate Time & Payroll tab is removed. Project reporting lives separately in **Projects → Project Stats** within the existing Projects workspace.

The performance view defaults to the previous weekday (Monday uses Friday). Its single reporting period controls ranking, drilldown, team utilization and monthly job-hour breakdown. It loads the existing verified MJV import feed on entry, on focus and on manual refresh; the existing 4 AM Central weekday automation remains the only scheduled importer. No additional automation or provider credential is introduced.

## Calculation and source rules

- External reports are observations in `external_labor_snapshots`; they never create native job punches, daily-clock punches or payable payroll segments. `labor_import_batches` preserves each distinct correction.
- Technician mappings use an existing profile ID plus the provider's stable employee identity. An active reporting roster is separate from employment history. Missing employees are not synthesized as zero-hour records.
- Effective-dated employee payroll configurations determine salary versus hourly treatment. Salary availability uses expected weekly hours divided by configured workdays, reduced by recorded leave and configured company holidays. These values are labeled assumptions; actual provider punches remain unchanged. Available hours stay unknown when provider leave coverage is missing. Before-hire dates and future dates are excluded.
- Efficiency is the ratio of verified matched job hours to available payroll work hours. Unreconciled, unknown, open or missing source entries stay visible and are excluded from percentages. A full leave day does not produce an absence warning; routine weekends do not produce missing-coverage warnings. Legitimate weekend work remains in history.
- Company-wide project reporting lives at **Projects → Project Stats**, within the existing Projects area (`/projects?projectView=stats`). Project Management keeps its operational filters. Project Stats uses the latest cumulative parent-order snapshot and displays its actual as-of date, independently of management filters. Cumulative snapshots are never added together. Completion stays unknown unless supplied. At/under quoted installation hours is on target; >100% through 110% is within 10% over; >110% is off target. The old Labor Dashboard table links here instead of maintaining a second assessment.
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

## Project Stats presentation

The company administrator view reuses `get_labor_dashboard`; it does not write source reports, native projects, payroll, source switches or employee settings. Company-wide project financials retain the existing admin gate. Other roles retain Project Management access according to their existing permissions. The view refreshes on entry, manual refresh and focus, using the same daily mirror; a missing report preserves the last as-of date. Errors retain the last loaded report with a warning.

Electronic Life's approved historical iPoint policy is isolated by organization in `projectPerformance.ts`: completed report since January 1, 2025, average quoted labor rate $122.70, and 17 identified warranty/scope projects using 92% installation allowance. The remaining recorded time is estimated warranty/scope time. Original used hours remain in total labor efficiency and earned-rate calculations. Other dealers and native MJV projects do not inherit these historical assumptions or the quoted-rate reference. Per-record source corrections and target overrides remain in the imported payload. This compatibility policy can be migrated to dealer configuration separately; this presentation change creates no new configuration store.

Quote accuracy counts assessed jobs, while labor budget efficiency weights by comparable quoted/used hours. The estimated earned rate uses quoted hours × average quoted rate ÷ recorded job hours. Jobs without comparable values are disclosed and excluded from the rate. Duplicate parent IDs are not counted twice and trigger a review notice. No period selector is shown for cumulative project snapshots. Individual imported project detail remains in iPoint.

Additional checks: `node tests/projects/performance.mjs` and `node tests/projects/performance-ui.mjs`. The live October 19, 2026 MJV mirror was read-only verified at 580 completed parent projects, 5,756.0364167 quoted hours, 5,304.12675 used hours and 17 warranty flags during implementation.

## Technician performance parity

Team utilization divides summed matched job hours by summed matched paid work hours (not an average of technician percentages). Unmatched payroll hours remain visible as excluded coverage; unknown entries do not become zeros. The paid-hour earned-rate card multiplies the historical completed-project rate by selected-period utilization and is explicitly a planning scenario across different work/period populations, not actual period revenue or profit. Native cutover with no comparable quoted labor dollars withholds that rate.

The modal averages complete unflagged per-day first/last pairs from imported source timestamps. It rejects overnight pairs, future/pre-hire dates and source timestamps after native cutover. Job clocks are not GPS arrivals. Electronic Life's Luis/Jesse schedule is explicitly assumed at 08:00–17:00; payroll efficiency still uses the established 8-hour weekday model less leave/holidays. Native timing unavailable in the aggregate RPC is withheld, never inferred from totals. Annual/multi-month selections expose technician job hours by month within the selected dates.

Additional checks: `node tests/labor-dashboard/timing.mjs`, `node tests/labor-dashboard/team-utilization.mjs`, and `node tests/labor-dashboard/tech-stats-entry.mjs`. No native clock, employee setting, source switch, existing import history, standalone dashboard or schedule is changed by this frontend integration.

Tech Stats validation: the complete labor regression suite, navigation routes and production build pass. The workspace-consolidation test fails at its existing Flow Tasks-button assertion on both unchanged main and this branch. Repository-wide typecheck also reports existing errors outside the changed files; compare against the same base before attributing them to this integration. Live MJV was still serving the prior Projects bundle at verification, so frontend publication remains required for both views.
