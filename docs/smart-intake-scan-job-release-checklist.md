# Smart Intake scan job release checklist

**Status: NOT APPROVED FOR DEPLOYMENT**

## Deployment gates

1. Apply and validate the Smart Intake migrations in an isolated staging project, including private quarantine bucket and foreign-key joins. Confirm staff cannot directly read quarantine objects.
2. Configure a trusted scanner with explicit HTTPS endpoint, matching host, and token. Verify real clean, blocked, timeout, malformed response, and unavailable-provider cases.
3. Configure `SMART_INTAKE_SCAN_JOB_SECRET` (32+ characters) and `SMART_INTAKE_SCAN_ENABLED` (default disabled). Only a trusted scheduler may invoke the job. Keep all secrets server-side.
4. Validate scan-job PostgREST joins and row shapes against staging data; verify tenant and intake IDs before storage access.
5. Run `npm run test:smart-intake`, typechecking, build, and an end-to-end email-to-review-to-disposition scenario in staging. Verify no live routing or automatic activation.
6. Implement authenticated employee attachment review and retention cleanup before enabling inbound attachments.

## Operational constraints

- The job is **not scheduled** by this branch. Its HTTP endpoint requires separate deployment and invocation configuration.
- Failed scans do not authorize access. No download or promotion of quarantined content is allowed until a trusted clean verdict is persisted.
- The current worker processes up to ten pending rows per call and has no durable lease. Concurrent schedulers may race; keep scheduling disabled until a claim/lease mechanism and concurrency tests exist.
- Treat `scan_status=failed` as a terminal failure requiring explicit retry handling; do not silently call it a malware detection.
- Do not merge the draft PR solely because the scan job compiles. Attachment lifecycle and CI remain release blockers.
