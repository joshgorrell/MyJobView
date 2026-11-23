# Assist canary readiness — safe operator check

The Windows x64 CI scenario has passed. The production Windows verifier is not deployed. The existing Linux control-plane endpoint expects a real, independently verified HTTPS canary at `POST /v1/assist/probe`. A synthetic responder, a static JSON file, or a manually toggled success flag is **not** acceptable.

## Read-only preflight on the VPS

The script reads the existing process environment, reports **only presence/validity**, and does not print credentials or start any service. Run from `/opt/myjobview/services/assist` after updating deployed source:

```sh
sudo bash -c 'set -a; . /etc/mjv-assist.env; set +a; cd /opt/myjobview/services/assist; node canary-readiness.mjs'
```

**Important:** this uses shell sourcing; only run if `/etc/mjv-assist.env` is trusted root-managed shell-compatible content. Do not paste the file contents. Exit status 1 is expected until genuine Windows proof exists. A valid version string and cache directory do not establish release approval.

## Private fixture for the Windows pilot

The Linux control service can give the Windows verifier a fresh guest download and viewer on the configured pilot runtime. Configure an independent 32-character-or-longer `ASSIST_CANARY_FIXTURE_TOKEN` together with `ASSIST_PILOT_ORGANIZATION_ID` and `ASSIST_PILOT_LOOPBACK_PORT`. Use a dedicated test dealer and Windows endpoint. The fixture endpoint is available only on the private pilot listener. Publish it only through the restricted pilot HTTPS ingress, and keep it out of the public gateway.

The Windows verifier requests `POST /v1/assist/fixture` using the fixture bearer token, `organization_id`, `generation`, and `probe_nonce` from the live request. Use `operation: "download"` to obtain the dedicated x64 helper and `operation: "viewer"` to wait for or open its viewer. The server revokes the viewer and deletes the temporary guest group after each probe. Cleanup failure blocks a successful probe. The Windows verifier must still independently prove consent, desktop input, and dealer isolation.

## Next engineering milestone

Build a dedicated, isolated Windows canary runner that validates real desktop/control and consent on a disposable test machine, and proves cross-dealer denial using two distinct test organizations. Bind the response to the incoming fresh `probe_nonce`, organization, and generation; supply fresh epoch-millisecond `checked_at` only after all three real checks. Use a trusted HTTPS origin and protected bearer token. Never issue success from inventory, configuration, a health check, or mocked events.

Keep `mjv-assist-control` and `mjv-assist-worker` stopped until the Windows runner and actual tests are verified. Do not set pilot approval flags or expose agent downloads prematurely.
