param(
    [Parameter(Mandatory)][string] $Executable,
    [Parameter(Mandatory)][ValidateSet('Allow', 'Deny')][string] $Decision
)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:GITHUB_REPOSITORY -ne 'joshgorrell/MyJobView') {
    throw 'This consent test requires a disposable GitHub-hosted MyJobView runner.'
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class AssistConsentDialog {
    [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr parent, int item);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeoutW(
        IntPtr window, uint message, IntPtr wParam, IntPtr lParam,
        uint flags, uint timeout, out IntPtr result);
}
'@

$deadline = [DateTime]::UtcNow.AddSeconds(15)
$ownedWindows = 0
$recognizedPrompts = 0
do {
    foreach ($window in [Windows.Automation.AutomationElement]::RootElement.FindAll(
        [Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition)) {
        try {
            $process = Get-Process -Id $window.Current.ProcessId -ErrorAction Stop
            if ($process.Path -ne $Executable) { continue }
            $ownedWindows++
            $labels = $window.FindAll([Windows.Automation.TreeScope]::Descendants,
                [Windows.Automation.Condition]::TrueCondition)
            $prompt = '*requesting remote desktop access*'
            if ($window.Current.Name -notlike $prompt -and -not ($labels | Where-Object { $_.Current.Name -like $prompt })) { continue }
            $recognizedPrompts++
            $handle = [IntPtr]::new($window.Current.NativeWindowHandle)
            # The pinned helper supports an enhanced Allow/Deny dialog and a standard Yes/No dialog.
            foreach ($ids in @(@(0xFFF2, 0xFFF3), @(6, 7))) {
                $allow = [AssistConsentDialog]::GetDlgItem($handle, $ids[0])
                $deny = [AssistConsentDialog]::GetDlgItem($handle, $ids[1])
                if (-not [AssistConsentDialog]::IsWindowVisible($allow) -or -not [AssistConsentDialog]::IsWindowVisible($deny)) { continue }
                $button = if ($Decision -eq 'Allow') { $allow } else { $deny }
                $itemId = if ($Decision -eq 'Allow') { $ids[0] } else { $ids[1] }
                if (-not [AssistConsentDialog]::IsWindowEnabled($button)) { continue }
                $result = [IntPtr]::Zero
                if ([AssistConsentDialog]::SendMessageTimeoutW($handle, 0x0111, [IntPtr]::new($itemId), $button, 2, 5000, [ref] $result) -ne [IntPtr]::Zero) {
                    exit 0
                }
            }
        } catch [Windows.Automation.ElementNotAvailableException] { continue }
        catch [Microsoft.PowerShell.Commands.ProcessCommandException] { continue }
    }
    Start-Sleep -Milliseconds 200
} while ([DateTime]::UtcNow -lt $deadline)
throw "The temporary guest did not show an actionable native consent button for $Decision (owned windows: $ownedWindows, recognized prompts: $recognizedPrompts)."
