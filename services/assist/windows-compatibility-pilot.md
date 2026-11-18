# Assist Windows compatibility pilot

This is an inventory and acceptance plan, **not** a certification or an activation bypass. The Linux control service and activation worker remain stopped until an independently verified Windows canary has exercised real desktop input, consent, and cross-dealer isolation. Do not set `ASSIST_APPROVED_MESHCENTRAL_VERSION`, `ASSIST_GUEST_PILOT_APPROVED`, or `ASSIST_ARM64_PILOT_APPROVED` based on this inventory.

## Known pilot machines (reported by operator)

| Machine | OS | CPU/architecture | Role | Status |
| --- | --- | --- | --- | --- |
| A | Windows 11 Home, build 26200 | ARM64, 16 GB | Technician viewer | Not tested |
| B | Windows 10 Home, build 19045 | Intel i5-7200U, x64 (Win32_Processor Architecture=9) | Customer endpoint | Not tested |

Windows 10 standard support has ended. Use a segregated test network and verify current security servicing/ESU status; do not weaken transport security or consent controls to enable legacy devices.

## Support matrix (release gates, not promises)

| Platform | Priority | Release gate |
| --- | --- | --- |
| Windows 11 x64 | Required | Native agent installation, desktop/input, consent, reconnect, uninstall |
| Windows 10 x64 | Required | Same; test Home and non-admin guest session |
| Windows 11 ARM64 | Required | Confirm agent architecture/emulation and desktop/control functionality on real hardware |
| Windows 10 x86 | Investigation | Verify signed native agent exists and can run securely before advertising |
| Windows 8.1 x86/x64 | Investigation | Secure TLS/agent/runtime compatibility; isolate if unsupported |
| Windows 7 x86/x64 | Investigation | Secure TLS/agent/runtime compatibility; isolate if unsupported |

A 64-bit Windows OS is not proof of x64: use processor Architecture 9 (x64), 12 (ARM64), 0 (x86). Agent URLs currently use MeshCentral `id=4` for Windows downloads; confirm this produces the correct architecture for each platform before deployment. A compatibility matrix must record exact agent hashes, OS build, test date, and result.

## Read-only Windows inventory

On each test machine, run the checked-in `windows-compat-inventory.ps1` using Windows PowerShell 5.1 or PowerShell 7. The script does not install anything, download agents, require administrator access, or transmit information. Review the JSON output before sharing: it includes computer model and OS details, but no usernames, device serials, or secrets.

## Pilot acceptance

1. Inventory machine B and record OS servicing status; do not treat a stale Windows 10 system as a safe production endpoint.
2. Stage an immutable verified MeshCentral agent cache; confirm the actual x64 installer is available and signed. Do not bypass existing runtime security verification.
3. Implement a **trusted HTTPS Windows canary runner** on an isolated disposable endpoint. The Linux control plane expects a nonce-bound, generation-bound response for real desktop control, enforced consent, and denied cross-tenant access. A simulated success response is not acceptable.
4. Run a supervised customer-approved temporary session on B, with A as viewer. Check visible consent, mouse and keyboard control, disconnect, revocation, and no unattended persistence.
5. Separately test managed enrollment, reconnect after reboot, elevation/UAC behavior, uninstall and cleanup, and offline handling.
6. Repeat on Windows 11 ARM64 and x64; then investigate Windows 10 x86, 8.1 and 7 in isolated test environments. Do not claim compatibility until actual signed agent testing passes.
7. Record screenshots/logs with sensitive data redacted; only then review approval flags and production rollout.

Keep Zoho Assist available as the fallback until all required gates pass.
