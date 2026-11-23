param(
    [Parameter(Mandatory)][string] $ReadyFile,
    [Parameter(Mandatory)][string] $InputFile
)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:GITHUB_REPOSITORY -ne 'joshgorrell/MyJobView') {
    throw 'This desktop target requires a disposable GitHub-hosted MyJobView runner.'
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
