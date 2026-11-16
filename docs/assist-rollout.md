# MJV Assist — Windows-first rollout

## Current milestone: dealer enrollment foundation

`/assist` is a signed-in staff workspace page, linked from Help. Active staff may download their own dealer's Windows x64 agent after platform provisioning. It does not yet list devices, create sessions, or replace Zoho Assist. No dealer is enabled by this migration. Dealer Admin → Integrations → Remote Support provides an on/off preference. Enabling before provisioning records a pending activation request; the provisioning worker is not implemented yet. Dealers never supply a provider account, API key, domain or installer URL. Platform infrastructure and automatic dealer provisioning are MJV responsibilities. Mac is outside the initial rollout.

The browser passes its expected organization to each RPC. Both RPCs independently resolve the active employee and active organization from `auth.uid()` and reject mismatches, customers, and inactive accounts. Tenant-context mismatches also block the UI. Status responses contain no enrollment URL. A download click rechecks enablement and records link issuance; it does not assert installation succeeded.

Configuration and issuance audit are in the unexposed `assist_private` schema, with RLS enabled and no direct authenticated table access. Caller-privileged public wrappers call private authorization-enforcing implementations. This phase intentionally does not grant engineers remote-control rights based on their ability to download an agent.

## Provisioning before enabling enrollment

1. Provision a persistent MeshCentral host with a pinned, tested release, valid HTTPS, backups and update procedures. It is a separate service from the Vite frontend and Supabase functions. Never deploy the public demo server as production infrastructure.
2. Create a dedicated non-default MeshCentral domain for Electronic Life. Every future dealer gets its own domain. Disable public account creation. Do not use the default/global administrator identity for MJV users or session tokens.
3. Create a Windows laptop group within that domain. Set explicit technician approval for desktop sessions. Limit enrolled devices to approved company machines. Validate the Windows x64 agent download from the domain's own Add Agent interface (`id=4`). Preserve upstream license notices in any redistributed installer.
4. Test installation on an actual field laptop: signatures/security prompts, administrator elevation, online status, full desktop control, reboot/reconnect, uninstall and removal. Time initial setup from the MJV page to working remote control; target <60 seconds on a supported Windows laptop with administrator access. Do not claim a measured time before testing.
5. Create a second test domain and prove isolation at MeshCentral as well as MJV: device listing, enrollment group, desktop connection, files, account permissions and history. A correctly shaped download URL alone is not proof that its mesh ID belongs to the domain.
6. A platform operator may then insert a row into `assist_private.dealer_setup`, with `organization_id`, `server_origin` (HTTPS origin without trailing slash), `mesh_domain`, and `windows_download_url` copied from that domain. Leave `enrollment_enabled=false` until the checks pass. Set `verified_at` and enable only for the pilot. Configuration has no public browser write API; never place keys or administrator login URLs in these fields.

The configuration constraints require a domain-scoped native `/meshagents?` link for x64 Windows, HTTPS origin consistency and unique server/domain assignment. They cannot validate the binary or the remote server's actual group ownership. Provisioning verification is mandatory.

### Disable and uninstall

Set `enrollment_enabled=false` to stop future MJV link issuance. An already downloaded agent or copied native enrollment URL is not revoked by this setting. Disable/rotate enrollment in MeshCentral as well, and disable affected users/devices there when revoking access. Removing a configuration row does not uninstall an external laptop agent or delete a remote MeshCentral domain.

## Dealer-managed activation contract

The existing settings UI uses `set_assist_enabled` to record the active dealer administrator's choice. The server rejects non-admin staff, inactive accounts and organization mismatches. Download issuance requires both dealer opt-in and a platform-verified enrollment configuration. Setting the preference alone does not mark support ready.

The next provisioning worker must consume enabled preferences, provision idempotently using the organization UUID as the stable mapping, allocate a separate MeshCentral domain/group, apply consent and permissions, and publish ready only after a two-tenant probe. Retry failures with bounded backoff and show pending/failed activation without requiring the dealer to visit MeshCentral. Turning off must revoke new session launches and ongoing sessions, disable enrollment and identities in MeshCentral, and show deactivation pending if the provider is unavailable. Re-enabling must reuse the dealer's existing mapping without duplicate accounts/groups. The current enrollment milestone only stops issuance of new MJV download links; it is not yet a complete access-revocation system.

## Remaining implementation, in order

1. **Dealer provisioning and connection authorization:** provision separate per-engineer MeshCentral identities in the correct dealer domain; add explicit MJV engineer grants separate from staff downloads. Implement a server-side session launch endpoint which checks active membership and grants on every call. Keep token-signing material server-side; do not embed an administrator identity. Map dealer, account and device on the server, ignoring client-provided MeshCentral IDs.
2. **Device inventory and sessions:** read live device status scoped to the dealer; add connection approval, short-lived embedded session launch, session termination and audit from actual server events. Verify that account/grant revocation terminates ongoing access. Do not label a launch request as a completed support session.
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

`dealer_setup`, `dealer_preferences` and `enrollment_downloads` are exclusively organization-owned and cascade on organization deletion. Employee deletion sets the audit actor to null while preserving the organization's issuance audit. Neither table creates Flow snapshots, notifications, attachments or polymorphic references. External MeshCentral domains/accounts/devices have an independent operational lifecycle and require explicit deprovisioning; SQL deletion alone does not remove them.

## Verification

- `npm run test:assist`: database tests for active/disabled/cross-dealer/anonymous/portal users, protected configuration, malformed or cross-domain links, disablement, issuance audit and transactional deletion; browser tests for pending/enabled/error/tenant mismatch and narrow layout; route regression checks.
- `npm run typecheck`
- `npm run build`

Local tests use PGlite and a browser fixture; they do not contact production or certify the external MeshCentral host. Production deployment and live two-domain testing remain required.
