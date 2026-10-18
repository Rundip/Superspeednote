# Super Speed Note - install for the current user (no admin needed)
# Copies dist\SuperSpeedNote_<version>.exe to %LOCALAPPDATA%\Programs\SuperSpeedNote\SuperSpeedNote.exe and adds a Start menu shortcut.
# Usage:  powershell -ExecutionPolicy Bypass -File install.ps1 [-Desktop]
param([switch]$Desktop)

$ErrorActionPreference = 'Stop'
$m = Select-String -Path (Join-Path $PSScriptRoot 'src\Program.cs') -Pattern 'const string Version = "(\d+\.\d+\.\d+)"'
$src = Join-Path $PSScriptRoot "dist\SuperSpeedNote_$($m.Matches[0].Groups[1].Value).exe"
if (-not (Test-Path $src)) { throw "Build first: powershell -ExecutionPolicy Bypass -File build.ps1" }

# ask a running copy to save and exit (notes stay in %APPDATA%\SuperSpeedNote - installing never touches them)
$running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'SuperSpeedNote*' -and $_.ProcessName -ne 'SuperSpeedNoteStartup' }
if ($running) {
    Add-Type -Namespace SSN -Name W -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int RegisterWindowMessage(string s);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l);
'@
    [SSN.W]::PostMessage([IntPtr]0xFFFF, [SSN.W]::RegisterWindowMessage('SuperSpeedNote.Quit'), [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    $running | ForEach-Object { $_.WaitForExit(5000) | Out-Null }
    $still = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'SuperSpeedNote*' -and $_.ProcessName -ne 'SuperSpeedNoteStartup' }
    if ($still) { $still | ForEach-Object { $_.CloseMainWindow() | Out-Null }; Start-Sleep -Seconds 2; $still | Stop-Process -Force }
}

$dir = Join-Path $env:LOCALAPPDATA 'Programs\SuperSpeedNote'
New-Item -ItemType Directory -Force $dir | Out-Null
$exe = Join-Path $dir 'SuperSpeedNote.exe'
Copy-Item $src $exe -Force

$shell = New-Object -ComObject WScript.Shell
$targets = @(Join-Path ([Environment]::GetFolderPath('Programs')) 'Super Speed Note.lnk')
if ($Desktop) { $targets += Join-Path ([Environment]::GetFolderPath('Desktop')) 'Super Speed Note.lnk' }
foreach ($lnk in $targets) {
    $s = $shell.CreateShortcut($lnk)
    $s.TargetPath = $exe
    $s.WorkingDirectory = $dir
    $s.IconLocation = "$exe,0"
    $s.Description = 'Super Speed Note'
    $s.Save()
    Write-Host "shortcut -> $lnk"
}

# keep the start-up entry (standby / tray, chosen in Settings) pointing at the installed copy
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$cur = (Get-ItemProperty $run -ErrorAction SilentlyContinue).SuperSpeedNote
if ($cur) {
    $mode = if ($cur -like '*--standby*') { '--standby' } else { '--tray' }
    Set-ItemProperty $run -Name SuperSpeedNote -Value "`"$exe`" $mode"
}

Write-Host "Installed: $exe"
Start-Process $exe
