# Read-only pilot verification. Never execute, install, or persist the downloaded agent.
param(
 [Parameter(Mandatory=$true)][string]$DownloadUrl,
 [ValidateSet("x64","arm64")][string]$Architecture="x64",
 [string]$OutputPath=".\\assist-agent-download-check.json"
)
$ErrorActionPreference="Stop"
$report=[ordered]@{schema_version=1;checked_at_utc=[DateTime]::UtcNow.ToString("o");architecture=$Architecture;status="BLOCKED";production_approval=$false;checks=@();sha256=$null;bytes=$null}
function Check([string]$Name,[bool]$Passed,[string]$Detail){
 $report.checks+=@{name=$Name;status=$(if($Passed){"PASS"}else{"FAIL"});detail=$Detail}
 if(-not $Passed){throw "check_failed"}
}
$temp=$null
try {
 $uri=[Uri]$DownloadUrl
 Check "HTTPS URL" ($uri.IsAbsoluteUri -and $uri.Scheme -eq "https" -and -not [string]::IsNullOrWhiteSpace($uri.Host) -and $uri.UserInfo -eq "" -and $uri.Fragment -eq "") "HTTPS without embedded credentials or fragments"
 $expectedId=if($Architecture -eq "arm64"){"43"}else{"4"}
 $params=@{}
 foreach($part in $uri.Query.TrimStart('?').Split('&')){
  if([string]::IsNullOrWhiteSpace($part)){continue}
  $pair=$part.Split('=',2)
  $key=[Uri]::UnescapeDataString($pair[0])
  if($params.ContainsKey($key)){throw "duplicate_query_parameter"}
  $params[$key]=if($pair.Count -eq 2){[Uri]::UnescapeDataString($pair[1])}else{""}
 }
 Check "Agent architecture request" ($params["id"] -eq $expectedId) "Expected agent type $expectedId"
 Check "Mesh group specified" ($params["meshid"] -match '^[A-Za-z0-9_-]{16,128}$') "Bounded URL-safe MeshCentral group identifier required"
 $temp=[IO.Path]::GetTempFileName()
 $handler=[System.Net.Http.HttpClientHandler]::new()
 $handler.AllowAutoRedirect=$false
 $client=[System.Net.Http.HttpClient]::new($handler)
 try {
  $client.Timeout=[TimeSpan]::FromSeconds(30)
  $response=$client.GetAsync($uri,[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
  try {
   Check "Download origin" ($response.RequestMessage.RequestUri.Scheme -eq "https" -and $response.RequestMessage.RequestUri.Host -eq $uri.Host -and $response.RequestMessage.RequestUri.Port -eq $uri.Port) "HTTPS and same origin"
   Check "Download response" ($response.IsSuccessStatusCode -and [int]$response.StatusCode -eq 200) "Direct HTTP 200 required; redirects refused"
   $limit=150MB
   Check "Declared size" ($null -eq $response.Content.Headers.ContentLength -or $response.Content.Headers.ContentLength -le $limit) "150 MiB maximum"
   $stream=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
   try {
    $file=[IO.File]::OpenWrite($temp)
    try {
     $buffer=[byte[]]::new(65536);$size=0
     while(($read=$stream.Read($buffer,0,$buffer.Length)) -gt 0){
      $size+=$read
      if($size -gt $limit){throw "download_size_exceeded"}
      $file.Write($buffer,0,$read)
     }
    }finally{$file.Dispose()}
   }finally{$stream.Dispose()}
  }finally{$response.Dispose()}
 }finally{$client.Dispose();$handler.Dispose()}
 $size=(Get-Item -LiteralPath $temp).Length
 Check "Minimum executable size" ($size -ge 256) "At least 256 bytes"
 $file=[IO.File]::OpenRead($temp)
 try {
  $header=[byte[]]::new(256)
  Check "DOS header readable" ($file.Read($header,0,$header.Length) -eq $header.Length) "Complete DOS header"
  Check "Portable executable" ($header[0] -eq 77 -and $header[1] -eq 90) "Windows MZ header"
  $offset=[BitConverter]::ToInt32($header,0x3c)
  Check "PE header offset" ($offset -ge 64 -and $offset -le ($size-24)) "PE header inside downloaded file"
  [void]$file.Seek($offset,[IO.SeekOrigin]::Begin)
  $pe=[byte[]]::new(24)
  Check "PE header readable" ($file.Read($pe,0,$pe.Length) -eq $pe.Length) "Complete PE header"
  Check "PE signature" ($pe[0] -eq 80 -and $pe[1] -eq 69 -and $pe[2] -eq 0 -and $pe[3] -eq 0) "Valid PE signature"
  $machine=[BitConverter]::ToUInt16($pe,4)
 }finally{$file.Dispose()}
 $expectedMachine=if($Architecture -eq "arm64"){0xAA64}else{0x8664}
 Check "Binary architecture" ($machine -eq $expectedMachine) ("Expected machine 0x{0:X4}, found 0x{1:X4}" -f $expectedMachine,$machine)
 $report.sha256=(Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash.ToLowerInvariant()
 $report.bytes=$size
 $report.status="PASS"
}catch{
 $report.status="FAIL"
 # Never log exception details, URLs, credentials, tokens or query strings.
 if($report.checks.Count -eq 0 -or $report.checks[-1].status -ne "FAIL"){
  $report.checks+=@{name="Download or validation";status="FAIL";detail="Unable to verify agent asset"}
 }
}finally{
 if($temp -and [IO.File]::Exists($temp)){Remove-Item -LiteralPath $temp -Force}
 $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
 Write-Host ("Agent download check: "+$report.status+" (no installation or execution performed)")
}
if($report.status -ne "PASS"){exit 1}
