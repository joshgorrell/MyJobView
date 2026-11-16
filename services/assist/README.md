# MJV-managed Assist host

This service is implemented but not deployed. It is separate from MJV's Vite frontend and Supabase. Dealers do not create MeshCentral accounts or enter credentials. One MJV platform host manages isolated MeshCentral processes with separate databases, certificate stores, ports, cookie keys and domain-scoped laptop groups. This first deployment trades extra per-dealer memory for reliable tenant shutdown and avoids restarting other dealers to add a new one. Capacity must be measured before scaling.

The control endpoint is `POST /v1/dealers/reconcile`. Only the activation worker's long bearer credential is accepted, and the request must hold a live MJV service-role lease. Operations serialize by dealer, persist the highest generation before side effects and reject stale requests. A single control instance owns its local state volume; shared-volume/multi-replica operation is deliberately unsupported. The host lock refuses concurrent or foreign-host ownership. Keep this service behind HTTPS and bind its backend to loopback.

## Native runtime and agent assets

Run `npm ci --ignore-scripts --prefix services/assist` to install the exact locked candidate runtime. The current candidate is MeshCentral 1.3.1. A version pin and metadata smoke do not establish Windows compatibility: do not mark it approved for production until the actual Windows canary passes.

Prepare agent assets once in staging with `node services/assist/prepare-agent-cache.mjs /var/lib/mjv-assist/releases/1.3.1-candidate/agentbuilds`. This invokes the installed runtime's release verification tool and verifies each filename, size and SHA-384 again before atomically publishing a new cache directory. Existing cache destinations are never overwritten. Promote the immutable cache with the tested runtime; grant the service user read/traverse access. Never copy live certificate/database directories from one dealer to another.

Each dealer links to that approved cache. Native release downloads and untested server self-updates are disabled at runtime. Native agent self-updates remain enabled (`noAgentUpdate: 0`), so installed clients follow the approved runtime's promoted agent assets when online. This avoids uncontrolled updates and 119 MiB of startup downloads per dealer. Automatic candidate discovery, full canary-backed promotion/rollback and operator alert delivery are still separate rollout requirements, not deployed by these files.

## Platform configuration

Use an environment file readable only by root/systemd. None of these values belong in Vite variables:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Existing MJV backend; service-only lease/recovery RPCs |
| `ASSIST_CONTROL_ORIGIN` | HTTPS platform control hostname, e.g. `https://assist-control.myjobview.com` |
| `ASSIST_CONTROL_TOKEN` | Random platform worker bearer secret, at least 32 characters |
| `ASSIST_PUBLIC_ORIGIN` | HTTPS support/agent hostname, e.g. `https://assist.myjobview.com` |
| `ASSIST_STATE_DIRECTORY` | Persistent private state, default `/var/lib/mjv-assist` |
| `ASSIST_AGENT_CACHE_DIRECTORY` | Approved immutable `agentbuilds` directory |
| `ASSIST_APPROVED_MESHCENTRAL_VERSION` | Must exactly match the installed package; set only after approval |
| `ASSIST_CANARY_ORIGIN`, `ASSIST_CANARY_TOKEN` | Trusted HTTPS Windows canary runner and long bearer secret |
| `ASSIST_CONTROL_PORT` | Loopback listener, default 8443 |

The Windows canary endpoint (`POST /v1/assist/probe`) is **not implemented in this Linux service**. It must operate a disposable Windows test machine, exercise real desktop/input/consent and two-dealer isolation, then echo the organization/generation and fresh `probe_nonce`, include a current epoch-millisecond `checked_at`, and return true `desktop_control`, `consent_enforced` and `cross_tenant_denied` evidence. Never point this at a fake health endpoint or a technician's active laptop. Missing configuration prevents host startup; failed/incomplete proof stops the dealer runtime and prevents activation.

## Deployment and recovery

Prepare a Linux host with Node 22+, trusted HTTPS, a dedicated `mjv-assist` account, private `/var/lib/mjv-assist`, backups and resource monitoring. Install the checked-out service under `/opt/myjobview/services/assist`; make the source/runtime read-only to the service account. Adapt the provided systemd units and Caddy example to actual paths and hostnames. `KillMode=control-group` is required: child runtimes must die when the control service dies. Each runtime is also launched directly with its stdin pipe held by the manager, avoiding a separate MeshCentral restart wrapper.

After the SQL migrations, start the control service and activation worker under the supervisor. The service requires a matching locked runtime, approved cache and canary configuration. Each activation creates its domain and service-only management account automatically; no provider signup is required. The management account/cookie key is never exposed to users. Native HTTP/WebSocket traffic is proxied only for currently serving runtimes. Disabled, unknown, failed or stopped routes return unavailable. Root/default-domain access is never proxied. The engineer API is implemented through the authenticated `assist-support` Edge Function and the private `/v1/support` host endpoint. See the session model below.

On disable, serving is removed first, proxied sockets close, the native process is stopped and the local port is checked closed before reporting revocation. Cookie keys rotate on stop. While off, previously copied installer URLs and native accounts are unreachable through the only public ingress. Re-enable intentionally restores the same native device group and existing agent identities; an old installer URL may work again after that explicit re-enable. Permanent installer invalidation would require a separate enrollment-key rotation policy and is not claimed here.

Runtime exit reports and control-host restart recovery queue reactivation only if the same generation is still enabled/ready in MJV. A stale incident cannot undo a later admin off action. Every 15 minutes the control plane repeats the actual isolated Windows canary for verified dealers; failures stop the runtime, invalidate ready downloads and queue recovery. Incidents are logged for platform monitoring. Operator notification routing and update promotion still need deployment.

Back up the complete private state volume, including per-dealer databases/certificates, before changes. The native agent trusts these certificates; regenerating them may strand existing laptops. Do not reuse a deleted dealer's state or group for another organization. MJV's deletion guard requires provider revocation first; external state retention/removal is a separate platform operation. Do not restore an old host snapshot without reconciling current MJV desired states.

## Verification and remaining work

`node tests/assist/control-service.mjs` tests the endpoint/core/crypto/group checks with fakes. `node tests/assist/native-smoke.mjs` runs two actual local MeshCentral processes and tests bootstrap, private authentication, group ownership/consent, idempotence, cross-key denial, stopping one dealer without stopping another and stable re-enable. It deliberately does not download/install Windows agents or claim full PC control.

Still required: real Windows canary implementation/host; actual platform deployment, DNS/TLS and monitoring/alerts; production deployment of the engineer API and live confirmation of the device list/browser support window; staged automated updates/rollback; live Windows UAC/reboot/reconnect and under-one-minute setup acceptance. Zoho Assist remains in use until those checks pass.

## Engineer sessions

Dealer Admin → Integrations → Remote Support includes Engineer access checkboxes. Active dealer administrators have access; other employees need an explicit grant. The Assist page lists the dealer's enrolled laptops and opens an online laptop in a separate support window. Keep the Assist page open: navigation/unmount closes the window and requests revocation. Existing MJV inactivity/logout rules remain in effect; test a long support session as part of the Windows pilot.

Deploy the `assist-support` Edge Function with platform `ASSIST_CONTROL_ORIGIN`, `ASSIST_CONTROL_TOKEN`, and `ASSIST_PUBLIC_ORIGIN` secrets. It verifies the staff JWT with Supabase, resolves the actor/dealer from database records, binds the signed Auth session claim, and requires the request Origin to match the canonical dealer subdomain. It passes only verified actor context to the private control endpoint; browser-supplied actor/session/dealer overrides are not trusted.

The host and service-only database API independently require an active profile, active Auth session, an active MJV browser-tracking row bound to that Auth session, operator permission and a ready dealer generation. The new nullable `user_sessions.auth_session_id` is filled from verified top-level JWT claims on the next authenticated session heartbeat; historical rows are not guessed/backfilled. Expired/revoked/forced-out sessions cannot renew native access. The trigger does not change existing activity/logout columns or table permissions.

Each launch creates a fresh non-admin native user with rights for exactly one online node. Native terminal/files/AMT access is excluded. Group/domain consent is still required. The platform management key/account is never returned to the engineer. Native login cookies can have a longer protocol validity, so access is bounded by deleting the temporary native user, not by pretending the cookie expires earlier. Each viewer lease lasts three minutes, renews through the signed-in Assist page every minute, and has a four-hour hard limit. The host checks leases every five seconds and revokes on expiration, logout, permission removal or changed dealer generation. Offline auth checks cannot extend a lease past its last confirmed expiry. One failed revocation does not starve checks for other sessions; if native user removal fails, the host stops that dealer and queues recovery.

New runtime starts rotate the login-cookie key and delete leftover temporary users before serving. This prevents replay of prior viewer URLs after host restart. Native device groups, databases and agent certificates remain stable. A viewer lease becoming `active` records authorized launch, not proof that the technician approved or a desktop tunnel connected; the support window displays actual connection state.

Private `engineer_access` grants cascade when an employee/dealer is deleted. Private `support_sessions` audit is organization-owned and cascades only with dealer deletion; employee deletion sets the actor to null and preserves the audit. Auth-session references are retained as historical identifiers and are not owners of the audit. No new Flow snapshots, notifications, attachments or polymorphic deletion mappings are created.
