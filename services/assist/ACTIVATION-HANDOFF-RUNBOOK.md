# Assist activation worker: live handoff diagnosis

## Confirmed production symptom (2026-11-18)
Electronic Life has one due activation job in MJV Supabase project `bqtsuzvuvqvgidipbsis`, pending since 2026-11-16 13:53 America/Chicago. As of 2026-11-18 09:29 America/Chicago it had **zero claims, no lease, no error**. This observation came from a read-only Supabase audit; it does **not** establish whether the external worker was deployed or stopped.

The activation worker is `services/assist/activation-worker.mjs`, launched with Node 22+ as `node services/assist/activation-worker.mjs` on the trusted Assist host. It is **not** a Supabase Edge Function or pg_cron task. The `assist-support` and `assist-guest` Edge Functions do not claim jobs. The worker polls every 15 seconds. Do not run a second worker against a live deployment until the active process/supervisor is identified.

## Read-only operator checks (on existing Assist host)

1. Identify hosting provider, machine/container, service manager, release path and last deployment. Do not provision a replacement host before finding the original.
2. Check process/service status and recent logs, e.g. `systemctl list-units '*assist*'`, `systemctl status <actual-worker-unit>`, `journalctl -u <actual-worker-unit> --since '2026-11-16' --no-pager`; for containers use the actual orchestrator's status/log commands. The unit name is deployment-specific.
3. Verify the **configured Supabase URL hostname** (never print the service-role key) is `bqtsuzvuvqvgidipbsis.supabase.co`. Confirm `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ASSIST_CONTROL_ORIGIN`, and `ASSIST_CONTROL_TOKEN` are present in the **worker process environment**, not only in a shell or frontend/Bolt environment. Report presence/absence only; never paste values of secrets.
4. The worker startup fails closed if required variables are missing or if Supabase/control origins are not valid HTTPS origins. Existing log messages: `Assist activation worker requires valid host configuration`, or `Assist activation worker failed; retrying without exposing credentials`. A healthy idle worker emits `{"outcome":"idle"}` roughly every 15 seconds.
5. If a worker is running and logging idle, confirm it targets the correct project and that its service-role key belongs to that project. If it logs errors, inspect service-level network/DNS/TLS access to Supabase and its RPC endpoint **without making a claim**. Do not log tokens, job payloads, URLs containing tokens, or response bodies.
6. Once host config is corrected, use the **existing supervised worker** to process the pending job. Watch for a new claim/lease in Supabase and the worker's `applied` / `retry` outcome. If it claims but fails during reconcile, inspect the separate control host and Windows canary; do not mark the job applied manually.
7. After a verified result, confirm `dealer_setup` exists and Admin > Integrations transitions appropriately. Enrollment/guest downloads remain gated until real Windows pilot approval. Do not set `ASSIST_GUEST_PILOT_APPROVED` or `ASSIST_ARM64_PILOT_APPROVED` to 1 without actual acceptance evidence.

## Recovery decision table

| Evidence | Likely action |
| --- | --- |
| No worker deployment/process found | Deploy the existing worker on the designated trusted Assist host with supervisor and private environment; preserve existing state and service architecture |
| Process repeatedly exits at startup | Correct missing/invalid host configuration; inspect supervisor restart policy |
| Worker running, no claims, reports idle | Verify project URL and service-role credentials target MJV; compare with database queue |
| Worker reports request errors | Diagnose outbound Supabase connectivity, TLS, key authorization and RPC access; avoid printing secrets |
| Claim appears, then retry | Worker handoff is fixed; inspect control service reconcile and Windows canary logs |
| Applied + verified setup | Run two-PC supervised Windows acceptance tests before opening customer access |

## Security
Never run `claim_assist_activation` manually for diagnosis: it mutates the queue and issues a lease. Never invoke `finish_assist_activation` or set ready flags manually. The existing Windows canary verifier requires independently observed desktop, consent and cross-tenant denial evidence. Keep Zoho Assist in service until the Windows pilot passes.
