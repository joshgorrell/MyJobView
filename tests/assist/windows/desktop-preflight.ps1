# Exercises only a disposable GitHub-hosted VM. Never run synthetic input on a technician's PC.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:GITHUB_REPOSITORY -ne 'joshgorrell/MyJobView') {
    throw 'This desktop probe is restricted to disposable GitHub-hosted MyJobView runners.'
}
if (-not [Environment]::UserInteractive -or [Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) {
    throw 'An interactive Windows desktop is required; a service/session-zero runner cannot certify remote control.'
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class AssistDesktopProbe {
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; public POINT(int x, int y) { X=x; Y=y; } }
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
# Screen capture uses physical pixels. Match WinForms coordinate space on scaled ARM desktops.
$previousDpiContext = [AssistDesktopProbe]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
if ($previousDpiContext -eq [IntPtr]::Zero) { throw 'Cannot establish a physical-pixel DPI context.' }
$form = $null
$bitmap = $null
$graphics = $null
try {
    $form = New-Object Windows.Forms.Form
    $form.Text = 'MJV disposable desktop probe'
    $form.StartPosition = 'Manual'
    $form.Location = New-Object Drawing.Point(80, 80)
    $form.ClientSize = New-Object Drawing.Size(480, 240)
    $form.TopMost = $true
    $panel = New-Object Windows.Forms.Panel
    $panel.Location = New-Object Drawing.Point(20, 20)
    $panel.Size = New-Object Drawing.Size(440, 100)
    $panel.BackColor = [Drawing.Color]::FromArgb(27, 142, 91)
    $textbox = New-Object Windows.Forms.TextBox
    $textbox.Location = New-Object Drawing.Point(20, 150)
    $textbox.Width = 440
    $form.Controls.Add($panel)
    $form.Controls.Add($textbox)
    $form.Show()
    $form.Activate()
    [void]$textbox.Focus()
    [void][AssistDesktopProbe]::SetForegroundWindow($form.Handle)
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        [Windows.Forms.Application]::DoEvents()
        if ([AssistDesktopProbe]::GetForegroundWindow() -eq $form.Handle) { break }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    # Foreground restrictions differ on Windows 11. Verify the screen before any native click.
    # Verify actual desktop pixels, not merely an off-screen control renderer.
    $point = $panel.PointToScreen((New-Object Drawing.Point(40, 40)))
    $bitmap = New-Object Drawing.Bitmap(1, 1)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($point.X, $point.Y, 0, 0, $bitmap.Size)
    $pixel = $bitmap.GetPixel(0, 0)
    if ($pixel.ToArgb() -ne $panel.BackColor.ToArgb()) { throw ("Desktop capture did not show the test window. DPI={0}, point={1},{2}, expected={3}, observed={4}" -f $form.DeviceDpi, $point.X, $point.Y, $panel.BackColor.ToArgb(), $pixel.ToArgb()) }
    $target = $textbox.PointToScreen((New-Object Drawing.Point(30, 10)))
    $nativePoint = [AssistDesktopProbe+POINT]::new($target.X, $target.Y)
    if ([AssistDesktopProbe]::WindowFromPoint($nativePoint) -ne $textbox.Handle) { throw 'The test textbox is not exposed on the actual desktop.' }
    if (-not [AssistDesktopProbe]::SetCursorPos($target.X, $target.Y)) { throw 'Cannot position test cursor.' }
    [AssistDesktopProbe]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [AssistDesktopProbe]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    [Windows.Forms.Application]::DoEvents()
    if ([AssistDesktopProbe]::GetForegroundWindow() -ne $form.Handle -or -not $textbox.Focused) { throw 'Native click did not activate the disposable textbox.' }
    # Send OS keyboard input, then observe the resulting control state.
    $challenge = 'mjv' + [Guid]::NewGuid().ToString('N')
    [Windows.Forms.SendKeys]::SendWait($challenge)
    [Windows.Forms.Application]::DoEvents()
    if ($textbox.Text -cne $challenge) { throw 'Native keyboard input did not reach the disposable test control.' }
    $result = [ordered]@{
        probe = 'windows-desktop-environment'
        architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
        desktop_capture = $true
        keyboard_input = $true
        remote_control_verified = $false
        activation_evidence = $false
    }
    $result | ConvertTo-Json -Compress | Write-Output
} finally {
    if ($graphics) { $graphics.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
    if ($form) { $form.Close(); $form.Dispose() }
    [void][AssistDesktopProbe]::SetThreadDpiAwarenessContext($previousDpiContext)
}
