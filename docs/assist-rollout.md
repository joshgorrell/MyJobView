# MJV Assist — Windows-first rollout

## Current milestone: enrollment, activation and native control service

`/assist` is a signed-in staff workspace page, linked from Help. Active staff may download their own dealer's Windows x64 agent after platform provisioning. It now includes an engineer laptop list and Connect/End Session controls, but is not deployed and does not yet replace Zoho Assist. No dealer is enabled by this migration. Dealer Admin → Integrations → Remote Support provides an on/off preference. Enabling before provisioning records a pending activation request; a durable activation queue and worker now handle retries and state transitions. The native control endpoint and managed MeshCentral runtime are now implemented, but not deployed. See `services/assist/README.md` for the deployment package and actual verification limits. Dealers never supply a provider account, API key, domain or installer URL. Platform infrastructure and automatic dealer provisioning are MJV responsibilities. Mac is outside the initial rollout.

The browser passes its expected organization to each RPC. Both RPCs independently resolve the active employee and active organization from `auth.uid()` and reject mismatches, customers, and inactive accounts. Tenant-context mismatches also block the UI. Status responses contain no enrollment URL. A download click rechecks enablement and records link issuance; it does not assert installation succeeded.

Configuration and issuance audit are in the unexposed `assist_private` schema, with RLS enabled and no direct authenticated table access. Caller-privileged public wrappers call private authorization-enforcing implementations. Downloading an agent does not grant engineer access. Explicit operator grants, active login/browser sessions, current dealer readiness and node ownership are checked independently for session launch.

## Provisioning before enabling enrollment

1. Provision a persistent MeshCentral host with a pinned, tested release, valid HTTPS, backups and update procedures. It is a separate service from the Vite frontend and Supabase functions. Never deploy the public demo server as production infrastructure.
2. Deploy the managed control service once for MJV. It creates one isolated MeshCentral process/data directory per dealer on the shared host, with a dedicated non-default domain and service-only management identity. The public ingress proxies only serving dealer paths and blocks the default domain.
3. Provision and test the actual Windows canary runner. The control service automatically creates the domain's laptop group, enforces consent and builds its native Windows download URL, but refuses verified activation until desktop/input and cross-dealer canary proof passes.
4. Test installation on an actual field laptop: signatures/security prompts, administrator elevation, online status, full desktop control, reboot/reconnect, uninstall and removal. Time initial setup from the MJV page to working remote control; target <60 seconds on a supported Windows laptop with administrator access. Do not claim a measured time before testing.
5. Prove real isolation with two dealer runtimes: device listing, enrollment group, desktop connection, files, account permissions and history. A correctly shaped download URL alone is not proof that its mesh ID belongs to the dealer.
6. Enable the dealer through MJV. The activation worker and control service perform setup automatically and publish enrollment availability only after verification. Do not bypass this with a manual ready flag or a fake canary endpoint.

The configuration constraints require a domain-scoped native `/meshagents?` link for x64 Windows, HTTPS origin consistency and unique server/domain assignment. They cannot validate the binary or the remote server's actual group ownership. Provisioning verification is mandatory.

### Disable and uninstall

Set `enrollment_enabled=false` to stop future MJV link issuance. An already downloaded agent or copied native enrollment URL is not revoked by this setting. Disable/rotate enrollment in MeshCentral as well, and disable affected users/devices there when revoking access. Removing a configuration row does not uninstall an external laptop agent or delete a remote MeshCentral domain.

## Dealer-managed activation contract

The existing settings UI uses `set_assist_enabled` to record the active dealer administrator's choice. The server rejects non-admin staff, inactive accounts and organization mismatches. Download issuance requires both dealer opt-in and a platform-verified enrollment configuration. Setting the preference alone does not mark support ready.

The activation worker consumes a leased, generation-fenced queue. The platform control endpoint must provision idempotently using the organization UUID as the stable mapping, allocate a separate MeshCentral domain/group, apply consent and permissions, and publish ready only after a two-tenant probe. Retry failures with bounded backoff and show pending/failed activation without requiring the dealer to visit MeshCentral. Turning off must revoke new session launches and ongoing sessions, disable enrollment and identities in MeshCentral, and show deactivation pending if the provider is unavailable. Re-enabling must reuse the dealer's existing mapping without duplicate accounts/groups. The current implementation stops new MJV download links immediately and queues provider deactivation. It shows deactivation pending until the control endpoint confirms remote revocation; this is not yet a deployed access-revocation system.

## Remaining implementation, in order

1. **Windows canary, platform deployment and connection authorization:** deploy the control service and real Windows canary, then verify the implemented temporary per-launch identities, explicit MJV engineer grants and authenticated session API against real Windows laptops. Keep token-signing material server-side; do not embed an administrator identity. Map dealer, account and device on the server, ignoring client-provided MeshCentral IDs.
2. **Device inventory and sessions:** verify the implemented live dealer inventory, native approval, temporary-account support windows, termination and audit. Actual tunnel-event ingestion remains separate from launch audit. Verify that account/grant revocation terminates ongoing access. Do not label a launch request as a completed support session.
3. **Laptop pilot:** verify all real workflows with Electronic Life engineers, including programming tools, multiple displays, UAC, reboot/reconnect and a field network. Exercise two simultaneous engineers and two test tenants.
4. **Operational rollout:** install on remaining laptops, monitor capacity/backups/updates, and verify customer-session needs before canceling Zoho Assist. Work-order links and customer enrollment follow the core pilot.

## Required update and reliability automation

This is part of launch acceptance, not optional follow-up maintenance. These monitors and the update pipeline are not deployed by the enrollment milestone.

- **Managed agent updates:** install the Windows agent as a service and retain MeshCentral's managed native/core update mechanism. Use the dealer server's current verified installer for downloads instead of bundling an old executable into MJV. Verify update/reconnect after a laptop has been offline through a release. Do not equate the server package version with the agent binary/core version.
- **Test before promotion:** automatically detect upstream stable releases daily, stage the exact server and agent artifacts on an isolated staging host with disposable Windows test VMs in two test domains. Prove enrollment, desktop frames, controlled mouse/keyboard input, UAC, multi-monitor, reboot/reconnect, tenant-denial tests and agent upgrade/reconnect. Never perform synthetic input on a real technician's computer.
- **Controlled automatic rollout:** promote only an approved passing artifact set to a pilot host/group first, then production during a defined maintenance window after the observation period. Server rollout affects all agents on that server; use a separate staging/pilot host unless the selected release's agent update controls have been proven to support the intended grouping. Preserve a known-good server/database/certificate backup and validated agent recovery procedure. Failed probes halt rollout; rolling back the server is not proof that agents have rolled back.
- **Continuous probes:** check HTTPS, DNS, certificate expiry, server responsiveness, relay/WebSocket connectivity and signed-in MJV launch authorization every five minutes. Perform real browser-to-agent desktop/view/input tests on an isolated Windows canary every fifteen minutes, plus reboot/reconnect and two-dealer isolation tests nightly and after every deployment. An HTTP 200 alone is insufficient.
- **Visibility:** maintain last successful check, last failure, observed/approved server and agent versions, laptop last seen and update pending/failed states. Mark sleeping/offline laptops separately from service incidents. Never display a green ready state for an untested or stale endpoint.
- **Recovery and alerts:** restart failed services under a supervisor, halt bad promotions and alert designated platform operators after two consecutive probe failures; show affected dealers a plain-language service notice. Alert on expiring certificates, failed backups and online agents that remain behind the approved release after the rollout grace period. Notification destination and recovery policy must be configured during provisioning.
- **Acceptance:** demonstrate a failed canary causing an alert and blocked promotion, a recovered service clearing the incident, a stale online agent being detected, an offline laptop catching up on return, and recovery after a failed agent update. Retain probe and deployment history without session credentials or captured customer screen content.

Remote access still depends on power, network access and local device permissions. Monitoring detects problems and reduces recovery time; it cannot guarantee access to an offline computer.

## Record lifecycle

`dealer_setup`, `dealer_preferences` and `enrollment_downloads` are exclusively organization-owned and cascade on organization deletion. Employee deletion sets the audit actor to null while preserving the organization's issuance audit. Neither table creates Flow snapshots, notifications, attachments or polymorphic references. External MeshCentral domains/accounts/devices have an independent operational lifecycle and require explicit deprovisioning; SQL deletion alone does not remove them. Dealer deletion is now blocked until the lifecycle worker has confirmed deprovisioning; safe deletion then cascades the organization-owned queue rows.

## Verification

- `npm run test:assist`: database tests for active/disabled/cross-dealer/anonymous/portal users, protected configuration, malformed or cross-domain links, disablement, issuance audit and transactional deletion; browser tests for pending/enabled/error/tenant mismatch and narrow layout; route regression checks.
- `npm run typecheck`
- `npm run build`

Local tests use PGlite and a browser fixture; they do not contact production or certify the external MeshCentral host. Production deployment and live two-domain testing remain required.

## Activation worker deployment and provider contract

`services/assist/activation-worker.mjs` runs under Node 22+ on a trusted MJV host, using built-in fetch. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ASSIST_CONTROL_ORIGIN`, and `ASSIST_CONTROL_TOKEN` in the platform secret store. Run `node services/assist/activation-worker.mjs` under a process supervisor, or use `--once` for a one-job operational check. Never put these values in Vite/browser variables. HTTPS certificates must be trusted; redirects are rejected. Database requests have a 30-second timeout. A reconcile request can run for up to 90 seconds and reserves at least 30 seconds of the lease to record the result. Responses have a 32 KiB size limit. Logs omit tokens, URLs with authentication, provider error bodies and installer links.

Only the service role can call `claim_assist_activation`, `validate_assist_activation_lease`, and `finish_assist_activation`. The worker and control endpoint must validate the current lease before starting remote side effects. Each claim lasts two minutes. Claims use `FOR UPDATE SKIP LOCKED`; every enable/off change invalidates the previous generation and immediately disables old MJV enrollment. Completion requires the same organization, generation and live lease. Failed jobs back off from 30 seconds up to one hour, stop after eight attempts and report that MyJobView needs to take action. Crash-expired leases can be reclaimed. Repeated writes of the same desired preference do not queue duplicate work. Disabling an organization also queues revocation.

The control endpoint (`POST /v1/dealers/reconcile`) is implemented in `services/assist/control-server.mjs`, with the native adapter in `managed-runtime.mjs` and `meshcentral-client.mjs`. It is **not deployed**. Its required Windows canary runner is not implemented by this Linux service. It accepts the worker bearer credential, an `Idempotency-Key` of `organization UUID:generation`, and the organization, generation, desired state, deterministic `mjv-<organization UUID without hyphens>` domain and lease. It must independently verify a live lease with MJV, persist its highest generation durably, serialize side effects per dealer, and reject stale generations. Database completion fencing alone cannot undo a stale external side effect. Do not point the worker at a generic MeshCentral endpoint: MeshCentral does not implement this MJV control contract.

An activation result must echo organization/generation/desired state and report `status: applied`, `verified: true`, `consent_enforced: true`, `isolation_verified: true`, `server_origin`, `mesh_domain`, and the domain-native Windows x64 URL. The worker validates all fields, HTTPS/origin/domain consistency and installer query parameters before completion. The provider must only attest verification after actual remote ownership/consent checks and isolated canary tests. An HTTP success response alone must never activate a dealer.

Deactivation requires `status: applied`, `verified: true`, and explicit `sessions_revoked`, `enrollment_revoked`, `accounts_disabled` attestations. It must revoke copied enrollment links and existing sessions in MeshCentral while preserving the stable mapping for safe re-enable. A timeout leaves revocation pending and retries; it never reports the dealer safely off merely because an HTTP request was attempted.

Unit tests exercise the actual worker and control service against fake dependencies. The native smoke test separately runs two actual local MeshCentral instances, including bootstrap, private management authentication, group/consent checks, cross-key rejection, isolated shutdown and stable re-enable. It does not exercise Windows desktop control. Database tests exercise the real SQL in PGlite. These tests validate MJV orchestration; they do not certify the MeshCentral host, full PC control, real agent updates, runtime monitoring or provider-side revocation.

## Native host implementation notes

The first host deployment uses isolated per-dealer processes on one shared machine, rather than all dealers sharing a MeshCentral process. This makes dealer disablement concrete (close ingress/sockets, stop its process and verify its port closed) and permits adding a dealer without restarting existing dealers. It uses more memory per dealer; measure capacity before expanding.

The exact candidate server dependency is locked in `services/assist/package-lock.json`. Native metadata smoke tests do not establish Windows compatibility. Approved assets are downloaded/verified in staging once, assembled into an immutable shared agent cache and promoted with the tested runtime. Online agents can update from promoted assets; untested server self-updates and per-runtime asset downloads are disabled. Candidate discovery, automated promotion/rollback and operator notifications remain rollout work.

Runtime crashes and control-service restart recovery use the service-only `requeue_assist_runtime` RPC to invalidate the matching ready generation and queue a new activation. Stale incidents cannot re-enable a dealer after a later off action. Verified runtime canaries repeat every fifteen minutes; failures stop ingress and queue recovery. The real Windows canary endpoint and actual notification routing must be deployed before claiming continuously tested production support.

## Engineer workflow implementation

Engineer grants, device listing, a separate browser support window and End Session are now implemented. The Edge Function verifies the staff JWT/dealer and passes authoritative identity to the host. Database checks include the live Auth session, bound MJV browser session, active profile/grant and current verified dealer generation. A temporary non-admin native account receives desktop-control rights for one online node. Three-minute leases renew while the Assist page remains signed in; native users are deleted on expiration or loss of access, with a four-hour hard limit. Native startup rotates login-cookie keys and removes leftover temporary users. See `services/assist/README.md` for deployment, revocation and record lifecycle details.

The first engineer UI opens a separate support window rather than embedding an iframe. Keep the Assist page open. The real Windows pilot must test background tabs, existing MJV inactivity/logout behavior, elevation, consent, reboot/reconnect and long sessions before Zoho cancellation. Neither unit/browser fixtures nor native metadata smoke establish successful full PC control.
