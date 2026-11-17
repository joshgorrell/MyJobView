# Run on a disposable Windows test host, not a customer workstation.
# Read-only readiness report. Never installs agents or enables production.
param([string]$OutputPath = ".\\assist-windows-readiness.json", [switch]$OperatorMachine)
$ErrorActionPreference = "Stop"
function Result([string]$Name,[bool]$Pass,[string]$Detail) {
  return [ordered]@{ check=$Name; status=$(if($Pass){"PASS"}else{"BLOCKED"}); detail=$Detail }
}
$checks = [System.Collections.Generic.List[object]]::new()
$os = Get-CimInstance Win32_OperatingSystem
$computer = Get-CimInstance Win32_ComputerSystem
$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
$checks.Add((Result "Windows host" ($os.Caption -match "Windows") $os.Caption))
$checks.Add((Result "Supported architecture" ($arch -in @("X64","Arm64")) $arch))
$checks.Add((Result "Windows version" ([Environment]::OSVersion.Version.Major -ge 10) ([Environment]::OSVersion.Version.ToString())))
$checks.Add((Result "At least 8 GB RAM" ($computer.TotalPhysicalMemory -ge 8GB) ("{0:N1} GB" -f ($computer.TotalPhysicalMemory/1GB))))
$node = Get-Command node -ErrorAction SilentlyContinue
$checks.Add((Result "Node.js installed" ($null -ne $node) $(if($node){(& node --version)}else{"Install supported Node.js 22+ on the test host"})))
if($node) {
  $nodeVersion = (& node --version).TrimStart("v").Split(".")[0]
  $checks.Add((Result "Node.js 22+" ([int]$nodeVersion -ge 22) (& node --version)))
}
$checks.Add((Result "Isolated test machine" $false "Tester must confirm disposable Windows VM or dedicated test device, not a customer PC"))
$checks.Add((Result "Separate operator" $OperatorMachine.IsPresent $(if($OperatorMachine){"Operator machine declared; verify it is physically/logically separate"}else{"Provide a separate operator browser/workstation"})))
$checks.Add((Result "Two test dealers" $false "Provision two isolated staging dealers and test accounts; manually verify"))
$checks.Add((Result "Staging HTTPS and verifier" $false "Configure HTTPS ingress, approved runtime/agent cache and independently audited Windows test harness"))
$report = [ordered]@{
  schema_version=1
  checked_at_utc=[DateTime]::UtcNow.ToString("o")
  computer_name=$env:COMPUTERNAME
  windows_build=$os.BuildNumber
  architecture=$arch
  operator_machine_declared=$OperatorMachine.IsPresent
  checks=@($checks)
  readiness="BLOCKED"
  production_approval=$false
  note="Informational preflight only; no native screen/control/consent tests performed."
}
$target=[IO.Path]::GetFullPath($OutputPath)
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $target -Encoding UTF8
Write-Host "Assist Windows readiness report: $target"
$checks | ForEach-Object { Write-Host ("{0}: {1} - {2}" -f $_.status,$_.check,$_.detail) }
Write-Host "Pilot NOT approved. Complete real Windows acceptance matrix before activation."
