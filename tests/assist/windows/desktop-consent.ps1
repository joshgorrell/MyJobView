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

$condition = [Windows.Automation.PropertyCondition]::new(
    [Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Button)
$buttonNames = if ($Decision -eq 'Allow') { 'Allow', 'Yes' } else { 'Deny', 'No' }
$deadline = [DateTime]::UtcNow.AddSeconds(15)
$ownedWindows = 0
$recognizedPrompts = 0
$decisionButtons = 0
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
            foreach ($button in $window.FindAll([Windows.Automation.TreeScope]::Descendants, $condition)) {
                if ($button.Current.IsEnabled -and $button.Current.Name.Replace('&', '') -in $buttonNames) {
                    $decisionButtons++
                    $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
                    exit 0
                }
            }
        } catch [Windows.Automation.ElementNotAvailableException] { continue }
        catch [Microsoft.PowerShell.Commands.ProcessCommandException] { continue }
    }
    Start-Sleep -Milliseconds 200
} while ([DateTime]::UtcNow -lt $deadline)
throw "The temporary guest did not show an actionable native consent button for $Decision (owned windows: $ownedWindows, recognized prompts: $recognizedPrompts, decision buttons: $decisionButtons)."
