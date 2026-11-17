# Isolated Windows test environment

`Assist Windows test environment` probes disposable GitHub-hosted Windows x64 and ARM64 machines. It uses no production secrets, customer accounts, platform tokens, installed support agents, or VPS connections. It runs only for changes to its own script/workflow or manual dispatch, rather than continuously consuming runner time.

The probe refuses non-GitHub-hosted environments and session zero. It creates a temporary colored test window, captures an actual screen pixel, sends native keyboard input to its own textbox, and observes a fresh challenge. It closes the window on success or error. It saves no screenshots or keyboard contents to artifacts. This establishes whether the hosted desktop is suitable for building the canary; failures must not be replaced by unconditional success.

A passing environment probe is **not a passing Assist canary**. Output explicitly sets `remote_control_verified` and `activation_evidence` to false, and is not consumed by the control service. Real browser-to-agent screen/input, native consent approval/denial, cross-dealer rejection, teardown and replay tests are still required. The Linux host's existing readiness gate is unchanged.

Do not run this on a working employee laptop. GitHub-hosted machines are ephemeral and isolated from production; ARM availability is documented at https://docs.github.com/en/actions/reference/runners/github-hosted-runners . A standard hosted VM's ability to run builds does not itself establish an interactive desktop; the workflow measures that prerequisite.
