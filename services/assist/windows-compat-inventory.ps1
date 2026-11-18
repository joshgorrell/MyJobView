# Read-only compatibility inventory. Windows PowerShell 5.1+; no administrator rights required.
$ErrorActionPreference = 'Stop'
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$system = Get-CimInstance Win32_ComputerSystem
$architecture = switch ([int]$cpu.Architecture) {
    0 { 'x86' }
    9 { 'x64' }
    12 { 'ARM64' }
    default { 'unknown (' + $cpu.Architecture + ')' }
}
[pscustomobject]@{
    CapturedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    Windows = $os.Caption
    Version = $os.Version
    Build = $os.BuildNumber
    OsArchitecture = $os.OSArchitecture
    ProcessorName = $cpu.Name
    ProcessorArchitecture = $architecture
    ProcessorAddressWidth = $cpu.AddressWidth
    Manufacturer = $system.Manufacturer
    Model = $system.Model
    PowerShellVersion = $PSVersionTable.PSVersion.ToString()
    AgentInstalled = 'not checked'
    AssistCompatibility = 'not tested'
} | ConvertTo-Json -Depth 3
