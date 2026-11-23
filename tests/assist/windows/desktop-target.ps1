param(
    [Parameter(Mandatory)][string] $ReadyFile,
    [Parameter(Mandatory)][string] $InputFile
)

$ErrorActionPreference = 'Stop'
$hostedTest = $env:GITHUB_ACTIONS -eq 'true' -and $env:RUNNER_ENVIRONMENT -eq 'github-hosted' -and $env:GITHUB_REPOSITORY -eq 'joshgorrell/MyJobView'
$dedicated = $env:ASSIST_WINDOWS_CANARY_DEVICE -and $env:ASSIST_WINDOWS_CANARY_DEVICE -eq $env:COMPUTERNAME
if ((-not $hostedTest -and -not $dedicated) -or -not [Environment]::UserInteractive -or [Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) {
    throw 'This check requires an interactive session on the dedicated Assist test device.'
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = [Windows.Forms.Form]::new()
$form.Text = 'MyJobView Assist disposable desktop target'
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'None'
$form.ClientSize = [Drawing.Size]::new(500, 300)
$form.TopMost = $true
$form.BackColor = [Drawing.Color]::FromArgb(38, 198, 127)
$form.KeyPreview = $true
$observed = [ordered]@{ clicked = $false; keys = '' }
$record = {
    [IO.File]::WriteAllText($InputFile, ($observed | ConvertTo-Json -Compress))
}
$form.Add_MouseDown({ $observed.clicked = $true; & $record })
$form.Add_KeyPress({
    param($sender, $eventArgs)
    $observed.keys += $eventArgs.KeyChar
    & $record
})
$form.Add_Shown({ $form.Activate(); [IO.File]::WriteAllText($ReadyFile, 'ready') })
try { [Windows.Forms.Application]::Run($form) } finally { $form.Dispose() }
