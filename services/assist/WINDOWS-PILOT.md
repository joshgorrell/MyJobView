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
