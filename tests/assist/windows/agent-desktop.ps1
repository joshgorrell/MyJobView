param([ValidateSet('target','peek','allow','deny')] [string]$Mode, [string]$StatePath, [string]$ViewerName)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:GITHUB_REPOSITORY -ne 'joshgorrell/MyJobView'){throw 'Disposable GitHub-hosted runner required'}
if(-not [Environment]::UserInteractive -or [Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0){throw 'Interactive desktop required'}
if($Mode -eq 'target'){
 Add-Type -AssemblyName System.Windows.Forms
 Add-Type -AssemblyName System.Drawing
 $form=[Windows.Forms.Form]::new();$form.Text='MJV isolated agent test';$form.StartPosition='Manual';$form.Location=[Drawing.Point]::new(80,80);$form.ClientSize=[Drawing.Size]::new(480,260);$form.TopMost=$true
 $panel=[Windows.Forms.Panel]::new();$panel.Location=[Drawing.Point]::new(20,20);$panel.Size=[Drawing.Size]::new(440,100);$panel.BackColor=[Drawing.Color]::FromArgb(27,142,91)
 $box=[Windows.Forms.TextBox]::new();$box.Location=[Drawing.Point]::new(20,160);$box.Width=440
 $form.Controls.Add($panel);$form.Controls.Add($box)
 $sessionId=[Diagnostics.Process]::GetCurrentProcess().SessionId
 $timer=[Windows.Forms.Timer]::new();$timer.Interval=100
 $timer.add_Tick({
  if(Test-Path ($StatePath+'.stop')){$form.Close();return}
  $p=$panel.PointToScreen([Drawing.Point]::new(40,40));$b=$box.PointToScreen([Drawing.Point]::new(30,10))
  $value=@{session_id=$sessionId;text=$box.Text;panel=@{x=$p.X;y=$p.Y};textbox=@{x=$b.X;y=$b.Y};rgb=@(27,142,91)}|ConvertTo-Json -Compress
  [IO.File]::WriteAllText($StatePath+'.tmp',$value);Move-Item -Force ($StatePath+'.tmp') $StatePath
 })
 try{$timer.Start();[void]$form.ShowDialog()}finally{$timer.Stop();$timer.Dispose();$form.Dispose()}
 exit 0
}
if($ViewerName -notmatch '^mjv-session-[a-f0-9]{32}$'){throw 'Scoped test viewer required'}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class AssistConsentInput {
 public delegate bool EnumProc(IntPtr hwnd, IntPtr data);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr data);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr data);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, System.Text.StringBuilder text, int size);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr parent, int id);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(System.Drawing.Point point);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
 static string Text(IntPtr hwnd) { var text=new System.Text.StringBuilder(2048); GetWindowText(hwnd,text,text.Capacity); return text.ToString(); }
 public static bool SelectConsent(string viewer, bool allow) {
  bool selected=false;
  EnumWindows((window,unused)=>{
   if(Text(window).Trim()!="MeshCentral") return true;
   bool scoped=false;
   EnumChildWindows(window,(child,data)=>{if(Text(child).Contains(viewer))scoped=true;return true;},IntPtr.Zero);
   if(!scoped)return true;
   var button=GetDlgItem(window,allow?0xFFF2:0xFFF3);
   if(button==IntPtr.Zero || Text(button).Trim()!=(allow?"Allow":"Deny"))return true;
   SetForegroundWindow(window);
   Rect rect;if(!GetWindowRect(button,out rect))return true;
   var point=new System.Drawing.Point((rect.Left+rect.Right)/2,(rect.Top+rect.Bottom)/2);
   var hit=WindowFromPoint(point);
   if(hit!=button || GetAncestor(hit,2)!=window)return true;
   if(!SetCursorPos(point.X,point.Y))return true;
   mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);
   selected=true;return false;
  },IntPtr.Zero);
  return selected;
 }

 [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, UIntPtr wparam, IntPtr lparam, uint flags, uint timeout, out UIntPtr result);
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
}
'@
$deadline=[DateTime]::UtcNow.AddSeconds(25)
$seen=@()
$buttonInfo=''
$clickError=''
do{
 if($Mode -ne 'peek' -and [AssistConsentInput]::SelectConsent($ViewerName,($Mode -eq 'allow'))){Write-Output 'consent_selection_applied';exit 0}
 $windows=[Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
 foreach($window in $windows){
  if($window.Current.Name.Trim() -ne 'MeshCentral'){continue}
  $all=$window.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
  $names=(@($all|ForEach-Object{$_.Current.Name}) -join ' ') -replace '\s+',' '
  $buttonInfo=(@($all|Where-Object{$_.Current.Name -match 'Allow|Deny'}|Select-Object -First 8|ForEach-Object{@{name=$_.Current.Name;type=$_.Current.ControlType.ProgrammaticName;enabled=$_.Current.IsEnabled;offscreen=$_.Current.IsOffscreen}})|ConvertTo-Json -Compress)
  $seen=@($seen+($window.Current.Name+': '+$names))|Select-Object -Unique
  if(-not $names.Contains($ViewerName)){continue}
  if($Mode -eq 'peek'){Write-Output 'consent_prompt_present';exit 0}
  $choices=if($Mode -eq 'allow'){@('Allow','&Allow','Yes','&Yes')}else{@('Deny','&Deny','No','&No')}
  foreach($element in $all){if($choices -contains $element.Current.Name.Trim()){
   # Invoke the actual native BUTTON only after matching this viewer's dialog.
   # Upstream win-userconsent assigns Allow=0xFFF2 and Deny=0xFFF3.
   $handle=[IntPtr]$element.Current.NativeWindowHandle
   $expectedId=if($Mode -eq 'allow'){0xFFF2}else{0xFFF3}
   if($handle -ne [IntPtr]::Zero -and [AssistConsentInput]::GetDlgCtrlID($handle) -eq $expectedId){
    $result=[UIntPtr]::Zero
    if([AssistConsentInput]::SendMessageTimeout($handle,0x00F5,[UIntPtr]::Zero,[IntPtr]::Zero,2,2000,[ref]$result) -ne [IntPtr]::Zero){Write-Output 'consent_selection_applied';exit 0}
   }
   $pattern=$null
   if($element.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){$pattern.Invoke();Write-Output 'consent_selection_applied';exit 0}
   try{
    $point=$element.GetClickablePoint()
    $hit=[Windows.Automation.AutomationElement]::FromPoint($point)
    $verifiedHit=$false
    for($depth=0;$hit -and $depth -lt 12;$depth++){
     if(($hit.GetRuntimeId() -join '.') -eq ($window.GetRuntimeId() -join '.')){$verifiedHit=$true;break}
     $hit=[Windows.Automation.TreeWalker]::RawViewWalker.GetParent($hit)
    }
    if(-not $verifiedHit){$clickError='Point was outside scoped consent element';continue}
    if(-not [AssistConsentInput]::SetCursorPos([int]$point.X,[int]$point.Y)){continue}
    [AssistConsentInput]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)
    [AssistConsentInput]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
    Write-Output 'consent_selection_applied';exit 0
   }catch{$clickError=$_.Exception.Message;continue}
  }}
 }
 Start-Sleep -Milliseconds 100
}while([DateTime]::UtcNow -lt $deadline)
[Console]::Error.WriteLine(('Expected scoped native consent prompt was not found. Mode='+$Mode+'; expected viewer='+$ViewerName+'; buttons='+$buttonInfo+'; click='+$clickError+'. ')+(($seen -join '; ').Substring(0,[Math]::Min(900,($seen -join '; ').Length))))
exit 1
