# Native Shop Time and Training

Employees can start and stop Shop Time or Training immediately from the Time Clock screen, including employees configured for job time or salary. A note is optional. No advance authorization is required for an employee-started timer.

The start and stop RPCs save the session and canonical time entry transactionally. Starts are serialized with the employee's other activities. A stable session UUID makes a repeated request safe after an ambiguous response. Only one work activity can run at a time. Stopping submits actual time for review; it never approves payroll.

The existing Internal Sessions management screen lists completed internal time and its Approve Time action uses the existing review RPC. A separate manager must approve completed time, including a manager's own Shop Time or Training. Employee-started sessions carry an explicit capture flag; existing fixed-hour requests and manager-scheduled sessions retain their prior workflow. Manager alerts are emitted once at completion with the recorded duration.

For work-allocation payroll, the existing generator includes only approved time entries. Daily Clock remains attendance and continues during internal work; internal hours are not added a second time. A payroll-period transition guard prevents finalizing daily-clock or allocation payroll while employee-started internal work remains draft/submitted. Salary work remains operational time and does not generate hourly pay. The daily-clock guard holds finalization for review rather than silently deducting attendance hours.

Native start validates the effective employee configuration, an active shift when required, and no active break. Native break/clock-out actions check for a running internal timer. Capture requires connectivity. GPS evidence is saved with the start/stop transaction; a denied/unavailable reading is marked failed without preventing time capture. Existing background GPS behavior is unchanged.

## Release and validation

Apply migration 20261020173000 only after the existing employee-time authority migration. This change is prepared in a pull request; production database changes and an iOS/Android build are separate release steps.

Focused checks:
- node tests/employee-time/native-internal-time-database.mjs
- node tests/employee-time/native-internal-time-runtime.mjs
- npm run test:employee-time
- npm run build

The GitHub workflow runs these checks. PGlite and component mocks do not certify Supabase-hosted integration, GPS hardware, native layout, or App Store/TestFlight delivery. Verify a signed-in daily-clock employee, allocation employee, and manager on a device after applying to staging. Test immediate start, stop, approval, competing job timer, break, overnight session, connection failure, repeated tap and payroll finalization.
