# Assist backend deployment — November 16, 2026

The MJV backend in project `bqtsuzvuvqvgidipbsis` now has the four reviewed Assist migrations and `assist-support` Edge Function version 1 with JWT verification enabled. No dealer has been enabled, no activation job has been queued and no installer is ready. The VPS gateway still responds with its setup notice. Full Windows desktop control has not been tested.

## Migration alignment

Supabase assigned these versions when applying the migrations. Repository filenames and database fixtures now match the actual deployment history; SQL contents are unchanged from PR #958. No earlier migration-history row was repaired or overwritten.

| Migration | Applied version |
|---|---|
| assist_windows_enrollment | 20261116192118 |
| assist_activation_lifecycle | 20261116192146 |
| assist_runtime_recovery | 20261116192148 |
| assist_engineer_sessions | 20261116192149 |

## Verification

Before deployment, the live staff/dealer/browser-session column types and existing browser triggers were inspected. The enrollment, lifecycle/recovery and engineer-session SQL tests passed before and after filename alignment. Live checks confirm all six private Assist tables have RLS and no anonymous/authenticated direct SELECT grant. Anonymous callers cannot call setup; staff cannot call worker/broker RPCs; service role can call the broker.

A read-only transaction using an existing administrator's database context returned off/not provisioned/no download readiness, rejected a foreign organization UUID, and rolled back its temporary request context. Zero enabled dealers, ready installations and activation jobs were confirmed. Live anonymous and malformed-token POSTs to the Edge endpoint both returned HTTP 401.

Security advisors report informational RLS-without-policy findings for the six private tables. This is intentional deny-by-default behavior: authorized access uses the checked RPC implementations, and direct staff/anonymous table access is revoked. See the [Supabase advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). No Assist-specific warning/error advisory was returned. Existing unrelated advisories were not changed.

## VPS backend configuration

`services/assist/configure-backend.mjs` is a platform-operator helper fixed to this MJV project and the two configured Assist hostnames. Run its reviewed root-owned copy with `sudo /usr/bin/node /opt/myjobview/services/assist/configure-backend.mjs`. It requires an interactive terminal, collects a temporary Supabase PAT with echo disabled, and never accepts credentials as command arguments or prints credential values/raw upstream errors.

Create a short-lived PAT scoped to this project with **API Keys: Read**, **API Key Secrets: Read**, and **Edge Function Secrets: Read-write**. It fetches the existing legacy service-role key over HTTPS, validates its project/role and a read-only broker response, then atomically saves `/etc/mjv-assist.env` as owner-only mode 0600. The service-role key is a privileged platform credential and stays on the trusted VPS; it must never enter Vite, browser code, chat or Git. The setup PAT is not saved and should be revoked after setup.

The helper generates the shared control token locally and writes only `ASSIST_CONTROL_ORIGIN`, `ASSIST_CONTROL_TOKEN`, and `ASSIST_PUBLIC_ORIGIN` to the project's Edge secret store over HTTPS. It does not change any other secret, deploy functions, start services, claim jobs or enable a dealer. Existing secure matching host configuration is reused on retry, preserving the shared token if the Edge upload was interrupted; an insecure, symlinked or mismatched file is rejected.

The helper deliberately leaves the approved Windows release and real canary configuration unset. Those remain release gates. After the real Windows runner, acceptance tests and operator monitoring are implemented/deployed, configure their values before installing/starting control and worker units and replacing the gateway setup response with the reviewed proxy routes. A successful connection to Supabase alone is not a passing Windows canary or a completed support session.
