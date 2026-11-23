# Assist canary readiness — safe operator check

The Windows x64 CI scenario has passed. The production Windows verifier is not deployed. The existing Linux control-plane endpoint expects a real, independently verified HTTPS canary at `POST /v1/assist/probe`. A synthetic responder, a static JSON file, or a manually toggled success flag is **not** acceptable.

## Read-only preflight on the VPS

The script checks configuration without starting Assist or printing credentials. Run it on the VPS after updating the deployed source. Use the same environment file parser as the Assist service.

```sh
sudo -n systemd-run --wait --pipe --collect \
  --property=EnvironmentFile=/etc/mjv-assist.env \
  --property=WorkingDirectory=/opt/myjobview/services/assist \
  /usr/bin/node /opt/myjobview/services/assist/canary-readiness.mjs
```

Check that the configuration rows pass. `WINDOWS_CANARY_REAL_PROOF` stays blocked and exits with status 1 because this command does not execute a live Windows session.

## Private fixture for the Windows pilot

The Linux control service can give the Windows verifier a fresh guest download and viewer on the configured pilot runtime. Configure an independent 32-character-or-longer `ASSIST_CANARY_FIXTURE_TOKEN` together with `ASSIST_PILOT_ORGANIZATION_ID` and `ASSIST_PILOT_LOOPBACK_PORT`. Use a dedicated test dealer and Windows endpoint. The fixture endpoint is available only on the private pilot listener. Publish it only through the restricted pilot HTTPS ingress, and keep it out of the public gateway.

The Windows verifier requests `POST /v1/assist/fixture` using the fixture bearer token, `organization_id`, `generation`, and `probe_nonce` from the live request. Use `operation: "download"` to obtain the dedicated x64 helper and `operation: "viewer"` to wait for or open its viewer. The server revokes the viewer and deletes the temporary guest group after each probe. Cleanup failure blocks a successful probe. The Windows verifier must still independently prove consent, desktop input, and dealer isolation.

## Windows verifier deployment

The bundled verifier is `services/assist/windows-live-verifier.mjs`. On a dedicated Windows x64 test VM, install Node 22+ and PowerShell 7. Install the locked test dependencies with `npm ci --ignore-scripts --prefix tests/assist/windows` and run `npx --prefix tests/assist/windows playwright install chromium`. Run the Windows canary host from an interactive Windows session on that VM. A session-zero Windows service cannot use the desktop test.

Set `ASSIST_WINDOWS_CANARY_VERIFIER` to the file URL of the bundled verifier. Set `ASSIST_WINDOWS_CANARY_DEVICE` to the test VM hostname and configure `ASSIST_WINDOWS_CANARY_SERVER_ORIGIN` and `ASSIST_WINDOWS_CANARY_FIXTURE_ORIGIN` with the exact HTTPS origins. The server origin must reach the private pilot listener from this machine, even while the public listener rejects an unverified runtime. Use normal trusted TLS. Configure the independent fixture token on both sides and the canary bearer token on the Windows host and Linux control side.

For the Windows harness, set `ASSIST_WINDOWS_CANARY_VERIFY_TIMEOUT_MS=45000` on the Windows host and `ASSIST_CANARY_PROBE_TIMEOUT_MS=50000` on the control host. Those settings retain the activation worker's existing lease reserve. The control host also needs `ASSIST_CANARY_ISOLATION_ORGANIZATION_ID` set to a fresh UUID reserved for a synthetic dealer. The control host starts that isolated runtime with no public or pilot ingress. The verifier refuses to report isolation evidence if that runtime is unavailable.

## Before activation

Deploy the runner on the dedicated test VM and exercise it through the private HTTPS path against two synthetic dealer runtimes. Confirm that the real probe returns fresh proof within the deployment timeout and that the guest download stops working after the response. The isolated CI run validates the protocol without changing production state.

Keep `mjv-assist-control` and `mjv-assist-worker` stopped until the Windows runner and actual tests are verified. Do not set pilot approval flags or expose agent downloads prematurely.

## Automatic activation for dealers

After the staged Windows pilot passes, the platform operator can enable automatic dealer routing with `ASSIST_CANARY_AUTOMATIC_DEALERS=1` and remove `ASSIST_PILOT_ORGANIZATION_ID`. Keep the private loopback port, independent fixture token, and reserved isolation organization configured. The verifier uses the same configuration for all dealer activation jobs. Only the dealer being checked has native routes on the private listener, which disconnects its probe sockets at the end. The public gateway continues to require a verified dealer runtime.

Keep the private listener behind access-controlled HTTPS for the dedicated verifier host. For the agent handshake, serve the same TLS certificate key for the configured Assist origin over the public and private ingress paths. The verifier must resolve the Assist origin to the private listener through the approved network route.

## Open dealer enrollment

Dealer enrollment starts closed. After the hosted verifier and worker are running and an existing pilot dealer completes a real guest session, set `assist_private.platform_release.enrollment_open` to true through the platform database. This permits new opt-ins. Existing dealer preferences, queued activations, and deactivation remain available while enrollment is closed.
