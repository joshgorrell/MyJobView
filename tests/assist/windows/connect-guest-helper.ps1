param([Parameter(Mandatory)][int] $AgentPid)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:GITHUB_REPOSITORY -ne 'joshgorrell/MyJobView') {
    throw 'This UI test is restricted to disposable GitHub-hosted MyJobView runners.'
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class AssistGuestDialog {
    [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr parent, int item);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeoutW(
        IntPtr window, uint message, IntPtr wParam, IntPtr lParam,
        uint flags, uint timeout, out IntPtr result);
}
'@

$agent = [Diagnostics.Process]::GetProcessById($AgentPid)
$deadline = [DateTime]::UtcNow.AddSeconds(12)
do {
    $agent.Refresh()
    if ($agent.HasExited) { throw 'The Windows helper exited before opening its window.' }
    $window = $agent.MainWindowHandle
    $connect = [AssistGuestDialog]::GetDlgItem($window, 1009)
    if ($connect -ne [IntPtr]::Zero -and [AssistGuestDialog]::IsWindowVisible($connect)) { break }
    Start-Sleep -Milliseconds 100
} while ([DateTime]::UtcNow -lt $deadline)

if ($connect -eq [IntPtr]::Zero -or -not [AssistGuestDialog]::IsWindowVisible($connect) -or -not [AssistGuestDialog]::IsWindowEnabled($connect)) {
    throw 'The temporary Windows helper did not show an enabled Connect button.'
}
foreach ($control in 1002, 1004) {
    if ([AssistGuestDialog]::IsWindowVisible([AssistGuestDialog]::GetDlgItem($window, $control))) {
        throw 'The temporary Windows helper exposed a persistent installation action.'
    }
}

# Dispatch the Connect button notification to the exact guest process we started.
$result = [IntPtr]::Zero
if ([AssistGuestDialog]::SendMessageTimeoutW($window, 0x0111, [IntPtr]::new(1009), $connect, 2, 5000, [ref] $result) -eq [IntPtr]::Zero) {
    throw 'The temporary Connect button action did not complete.'
}
