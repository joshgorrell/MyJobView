# Read-only Windows pilot agent download validation. Does not execute or install anything.
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
 Check "HTTPS URL" ($uri.Scheme -eq "https" -and -not [string]::IsNullOrWhiteSpace($uri.Host) -and $uri.UserInfo -eq "" -and $uri.Fragment -eq "") "HTTPS host and no embedded credentials required"
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
 Check "Mesh group specified" ($params["meshid"] -match '^[a-fA-F0-9]{64}
 $temp=[IO.Path]::GetTempFileName()
 $client=[System.Net.Http.HttpClient]::new()
 try {
  $client.Timeout=[TimeSpan]::FromSeconds(30)
  # HttpClient follows redirects by default; reject cross-origin redirects and HTTPS downgrades.
  $response=$client.GetAsync($uri,[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
  Check "Download origin" ($response.RequestMessage.RequestUri.Scheme -eq "https" -and $response.RequestMessage.RequestUri.Host -eq $uri.Host -and $response.RequestMessage.RequestUri.Port -eq $uri.Port) "No cross-origin redirect or downgrade"
  try {
   Check "Download response" ($response.IsSuccessStatusCode) ("HTTP "+[int]$response.StatusCode)
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
 }finally{$client.Dispose()}
 $size=(Get-Item -LiteralPath $temp).Length
 Check "Minimum executable size" ($size -ge 256) "At least 256 bytes"
 $file=[IO.File]::OpenRead($temp)
 try {
  $header=[byte[]]::new(256)
  [void]$file.Read($header,0,$header.Length)
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
 # Do not include exception messages, URLs, tokens, or download query strings in output.
 if($report.checks.Count -eq 0 -or $report.checks[-1].status -ne "FAIL"){
  $report.checks+=@{name="Download or validation";status="FAIL";detail="Unable to verify agent asset"}
 }
}finally{
 if($temp -and [IO.File]::Exists($temp)){Remove-Item -LiteralPath $temp -Force}
 $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
 Write-Host ("Agent download check: "+$report.status+" (no installation or execution performed)")
}
if($report.status -ne "PASS"){exit 1}
) "64-character mesh group hash required"
 $temp=[IO.Path]::GetTempFileName()
 $client=[System.Net.Http.HttpClient]::new()
 try {
  $client.Timeout=[TimeSpan]::FromSeconds(30)
  $response=$client.GetAsync($uri,[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
  try {
   Check "Download response" ($response.IsSuccessStatusCode) ("HTTP "+[int]$response.StatusCode)
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
 }finally{$client.Dispose()}
 $bytes=[IO.File]::ReadAllBytes($temp)
 Check "Portable executable" ($bytes.Length -ge 256 -and $bytes[0] -eq 77 -and $bytes[1] -eq 90) "Windows MZ header"
 $offset=[BitConverter]::ToInt32($bytes,0x3c)
 Check "PE header offset" ($offset -ge 64 -and $offset -le ($bytes.Length-24)) "PE header inside downloaded file"
 Check "PE signature" ($bytes[$offset] -eq 80 -and $bytes[$offset+1] -eq 69 -and $bytes[$offset+2] -eq 0 -and $bytes[$offset+3] -eq 0) "Valid PE signature"
 $machine=[BitConverter]::ToUInt16($bytes,$offset+4)
 $expectedMachine=if($Architecture -eq "arm64"){0xAA64}else{0x8664}
 Check "Binary architecture" ($machine -eq $expectedMachine) ("Expected machine 0x{0:X4}, found 0x{1:X4}" -f $expectedMachine,$machine)
 $report.sha256=(Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash.ToLowerInvariant()
 $report.bytes=$bytes.Length
 $report.status="PASS"
}catch{
 $report.status="FAIL"
 # Do not include exception messages, URLs, tokens, or download query strings in output.
 if($report.checks.Count -eq 0 -or $report.checks[-1].status -ne "FAIL"){
  $report.checks+=@{name="Download or validation";status="FAIL";detail="Unable to verify agent asset"}
 }
}finally{
 if($temp -and [IO.File]::Exists($temp)){Remove-Item -LiteralPath $temp -Force}
 $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
 Write-Host ("Agent download check: "+$report.status+" (no installation or execution performed)")
}
if($report.status -ne "PASS"){exit 1}
