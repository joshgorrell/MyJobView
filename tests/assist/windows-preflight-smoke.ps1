# Windows CI only: parse the real script and exercise safe rejection without networking.
$ErrorActionPreference="Stop"
$scriptPath=Join-Path $PSScriptRoot '..\\..\\services\\assist\\windows-agent-download-check.ps1'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($scriptPath,[ref]$tokens,[ref]$errors)
if($null -eq $ast -or $errors.Count -gt 0){
 $errors | ForEach-Object {Write-Host ("PowerShell parse failure at line "+$_.Extent.StartLineNumber)}
 throw "agent_preflight_parse_failed"
}
$root=Join-Path ([IO.Path]::GetTempPath()) ("assist-preflight-"+[Guid]::NewGuid().ToString("N"))
[IO.Directory]::CreateDirectory($root)|Out-Null
try{
 foreach($arch in @("x64","arm64")){
  $reportPath=Join-Path $root ("invalid-"+$arch+".json")
  # Intentionally invalid HTTPS URL: must fail before any HTTP request.
  & $scriptPath -Architecture $arch -DownloadUrl "http://invalid.example/meshagents?id=4" -OutputPath $reportPath
  if($LASTEXITCODE -ne 1){throw "invalid_url_not_rejected"}
  if(-not (Test-Path -LiteralPath $reportPath)){throw "missing_failure_report"}
  $report=Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
  if($report.status -ne "FAIL" -or $report.production_approval -ne $false -or $report.architecture -ne $arch){throw "invalid_failure_report"}
  if($report.sha256 -or $report.bytes){throw "unexpected_download_result"}
 }
 $global:LASTEXITCODE=0 # The intentionally failing child checks succeeded; clear their process exit code.
 Write-Host "Assist Windows agent preflight parsed and rejected invalid URLs on $($PSVersionTable.PSVersion)"
}finally{Remove-Item -LiteralPath $root -Recurse -Force}
