# Assist Windows pilot — release gate

**Status: NOT EXECUTED.** No production activation or native version approval is authorized by this document. The Windows runner and approved canary deployment must exist before these results can be marked PASS.

## Prerequisites
- Isolated staging host with prepared, hash-verified MeshCentral runtime and agent cache; pilot gates remain off in production.
- Two Windows computers (one operator and one supported device), or an isolated Windows VM plus operator browser. Test x64 first; ARM64 separately behind its own gate.
- Two independent MJV dealers for tenant-isolation tests; a dedicated test account for each.
- Record Windows build/architecture, agent version, operator browser, UTC timestamps, tester, measured durations and screenshots **without** codes, tokens, cookies, or viewer URLs.
- Do not test against a customer production computer. Do not approve `ASSIST_APPROVED_MESHCENTRAL_VERSION`, `ASSIST_GUEST_PILOT_APPROVED` or `ASSIST_ARM64_PILOT_APPROVED` based only on mock tests.

## Acceptance matrix
| ID | Flow | Expected result |
|---|---|---|
| G01 | Generate code and open link on clean Windows computer | Single-use code is accepted within its expiry; temporary Connect-only client, not a persistent service |
| G02 | Approve desktop request | Operator can view and control desktop; explicit consent prompt and notification visible |
| G03 | Deny desktop request | No screen or input access |
| G04 | Close temporary client and retry old code/link | No remote access; fresh code required |
| G05 | End from operator, then repeat ending from guest | Viewer revoked and cannot resume |
| G06 | Reboot Windows after temporary session | No persistent guest enrollment or automatic reconnection |
| G07 | Expire code, attempt second redemption, use wrong dealer | Each attempt rejected without cross-dealer access |
| E01 | Enroll an authorized test Windows computer | Persistent agent appears under its dealer only |
| E02 | Rename to a friendly name; restart host | Name persists; native device ID remains unchanged |
| E03 | Connect to enrolled computer | Session requires configured consent and grants only desktop/input rights |
| E04 | Remove enrollment while viewer is active | Viewer is revoked and device disappears from enrolled list |
| E05 | Reboot removed computer with old installed agent | Old enrollment never regains support privileges, even if native node returns |
| E06 | Issue a **new guest code** to that same removed computer | New temporary guest session succeeds with consent; prior enrollment tombstone does not block it |
| E07 | Re-enroll removed computer as a *new enrollment* | Works only with a new authorized enrollment identity; old tombstoned ID stays blocked |
| S01 | Revoke operator permissions / sign out mid-session | Access ends promptly and cannot be resumed with saved URL |
| S02 | Stop/restart host mid-session | Stale viewer URLs and guest sessions cannot resume |
| S03 | Access second dealer from first dealer's credentials | No inventory, code, session, or node access |
| P01 | Measure fresh guest support | Record code-to-view and code-to-control separately; target under 60 seconds to first useful support |
| P02 | Measure repeat enrolled support | Record click-to-view and click-to-control, including consent latency |
| A01 | ARM64 temporary guest (separate pilot) | Architecture-specific download works, consent and desktop/input verified; x64 success does not imply ARM64 success |

## Test recording
For each ID record: PASS / FAIL / BLOCKED, date/time, tester, environment/build, steps, observed result, logs sanitized of credentials, and issue/PR link. **BLOCKED is not PASS.** If a session survives a revoke or crosses dealers, stop the pilot and leave activation off.

## Release decision
Production approval requires all relevant G/E/S cases passing on actual Windows, a working canary runner, reviewed dependency security, successful rollback/recovery, and explicit operator sign-off. The guest support code is a new temporary identity; removing permanent enrollment must not ban the physical computer.

## Independent Windows harness integration (not yet deployed)

The Windows-only canary host can load the verifier module using `ASSIST_WINDOWS_CANARY_VERIFIER=file:///.../services/assist/windows-canary-verifier.mjs` and an absolute path in `ASSIST_WINDOWS_CANARY_HARNESS_EXE` to a separately installed, audited Windows .exe test harness. The module starts that executable with no shell, sends the canary request as JSON on stdin and accepts a single JSON result on stdout. A nonzero exit, invalid output, missing executable, timeout or cancellation must fail the canary. The host validates the resulting proof fields. Never set these variables to a script that merely echoes success: the external harness must operate disposable Windows machines and independently observe real desktop/input, denied consent and cross-dealer rejection. No harness executable is bundled, and no canary or production activation is authorized by this integration.

The Windows harness bridge additionally requires `ASSIST_WINDOWS_CANARY_HARNESS_SHA256` set to the 64-character SHA-256 digest of the reviewed executable. It refuses to run an unpinned or modified binary. Recalculate and review the digest after each intentional harness update. Keep the executable in a restricted directory writable only by trusted administrators; digest validation is not a substitute for host filesystem access controls.

## First physical Windows pilot setup

1. Use a **disposable Windows x64 VM or dedicated test PC** plus a separate operator workstation/browser. The host should have Node.js 22+; ARM64 must be a separate later run.
2. From a PowerShell terminal in the checked-out repository, run `powershell -NoProfile -ExecutionPolicy Bypass -File services/assist/windows-pilot-readiness.ps1` on the test host. Inspect the JSON readiness report. The report is **always BLOCKED** until independently reviewed; it does not claim screen sharing works.
3. Provision two isolated staging dealer organizations and accounts, a staging HTTPS control ingress and an isolated Linux MeshCentral host with verified agent cache. Do not use production customer devices.
4. Install and independently review a Windows desktop/input/consent/isolation harness. Set the approved SHA-256 and verifier paths on the Windows canary host. No such harness is bundled today.
5. Execute the G/E/S/P matrix on real machines and capture sanitized results using `node services/assist/windows-pilot-runner.mjs`. Only after real acceptance, canary evidence and explicit approval should a separate controlled production rollout be considered.

Do not commit generated JSON reports containing computer names, screenshots, credentials, or device identifiers. This script does not install software, open firewall ports, enroll machines or change service flags.

## Agent download verification before the first Windows connection

On a disposable Windows test computer, run `powershell -NoProfile -ExecutionPolicy Bypass -File services/assist/windows-agent-download-check.ps1 -Architecture x64 -DownloadUrl '<staging agent download URL>'` (use `arm64` only for the separate ARM64 pilot). The script downloads the candidate agent into a temporary file, verifies HTTPS, the requested MeshCentral agent architecture, a bounded size, the PE header and machine architecture, records SHA-256 and byte count, then deletes the file. It **does not execute or install** the downloaded binary. Do not share the URL or generated report if it contains sensitive local details. A PASS confirms only download integrity and architecture, not Windows compatibility, code signing, consent, desktop control, or production readiness. The real two-computer pilot remains mandatory.
