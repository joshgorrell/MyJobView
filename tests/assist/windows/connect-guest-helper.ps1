param([Parameter(Mandatory)][int] $AgentPid)

$ErrorActionPreference = 'Stop'
$hostedTest = $env:GITHUB_ACTIONS -eq 'true' -and $env:RUNNER_ENVIRONMENT -eq 'github-hosted' -and $env:GITHUB_REPOSITORY -eq 'joshgorrell/MyJobView'
$dedicated = $env:ASSIST_WINDOWS_CANARY_DEVICE -and $env:ASSIST_WINDOWS_CANARY_DEVICE -eq $env:COMPUTERNAME
if ((-not $hostedTest -and -not $dedicated) -or -not [Environment]::UserInteractive -or [Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) {
    throw 'This check requires an interactive session on the dedicated Assist test device.'
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
