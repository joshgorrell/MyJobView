# Isolated Windows test environment

`Assist Windows test environment` probes a disposable GitHub-hosted Windows x64 machine by default. ARM64 is available only as an explicit manual diagnostic and is not an approved test target. It uses no production secrets, customer accounts, platform tokens, installed support agents, or VPS connections. It runs only for changes to its own script/workflow or manual dispatch, rather than continuously consuming runner time.

The probe refuses non-GitHub-hosted environments and session zero. It creates a temporary colored test window, captures an actual screen pixel, sends native keyboard input to its own textbox, and observes a fresh challenge. It closes the window on success or error. It saves no screenshots or keyboard contents to artifacts. This establishes whether the hosted desktop is suitable for building the canary; failures must not be replaced by unconditional success.

A passing environment probe is **not a passing Assist canary**. Output explicitly sets `remote_control_verified` and `activation_evidence` to false, and is not consumed by the control service. Real browser-to-agent screen/input, native consent approval/denial, cross-dealer rejection, teardown and replay tests are still required. The Linux host's existing readiness gate is unchanged.

Do not run this on a working employee laptop. GitHub-hosted machines are ephemeral and isolated from production; ARM availability is documented at https://docs.github.com/en/actions/reference/runners/github-hosted-runners . A standard hosted VM's ability to run builds does not itself establish an interactive desktop; the workflow measures that prerequisite.

## Measured results — November 17, 2026

Windows Server 2022 x64 passed actual desktop-pixel capture and native keyboard input in all three initial runs. Windows 11 ARM64 did not: foreground activation failed initially, and subsequent tests could not observe the colored test panel even after physical-pixel DPI alignment (reported DPI 96). The ARM diagnostic remains failing rather than returning synthetic success. The current hosted ARM image is not usable as a desktop-canary target under this setup. This result does not prove that the MeshCentral ARM agent fails on a real ARM laptop.

PR validation therefore targets only the measured working x64 environment. The manual ARM job retains the same strict assertions for future investigation. ARM guest approval stays off. Actual remote desktop/input, consent and tenant-isolation tests are still unfinished on both architectures; no production readiness evidence is emitted by either job.

## Real native agent/browser test

The x64 job now prepares the locked MeshCentral runtime, verifies the upstream agent cache, installs an agent only on its disposable VM, and exercises a real browser viewer through the managed runtime and control HTTP/WebSocket proxy. A local TLS fixture uses the runtime's own certificate/key and a fresh loopback port; self-signed trust relaxation is confined to that fixture/browser context. It never disables global TLS checks or connects to the production VPS.

The test requires a scoped native consent prompt, verifies that no desktop frames appear before consent or after Deny, then uses a different temporary viewer to Allow, samples pixels from its disposable native window, and sends mouse/Unicode keyboard input through the browser's native MeshCentral client. A unique typed challenge is observed independently in the native textbox. It checks viewer revocation, old-URL rejection, cross-dealer cookie rejection and isolated dealer shutdown. The temporary agent is uninstalled and runtime/windows are removed on teardown; the VM itself is ephemeral. No screenshots, cookies, private keys or viewer URLs are uploaded as artifacts.

This test does not certify Windows ARM, UAC/secure desktop, reboot/reconnect, multi-monitor handling, MJV live JWT authorization, or continuous production monitoring. It does not implement the trusted `/v1/assist/probe` endpoint and explicitly emits `activation_evidence=false`. Those checks and control-plane integration remain required before production activation.
