# Super Speed Note - Microsoft Store package (MSIX)
# - Builds the app, a tiny start-up helper and the Store logos, then packs dist\store\SuperSpeedNote_<version>_x64.msix.
#   Upload that file in Partner Center; the Store signs it (no certificate needed).
# - The Store identity (name / publisher) comes from store\store.json - paste the values Partner Center shows.
# - Uses makeappx / makepri from Microsoft's Windows SDK build tools package on nuget.org (downloaded once, ~21 MB).
# Usage:
#   powershell -ExecutionPolicy Bypass -File package.ps1               build the .msix
#   powershell -ExecutionPolicy Bypass -File package.ps1 -Register     also install it unpacked for a local test (needs Developer Mode)
#   powershell -ExecutionPolicy Bypass -File package.ps1 -Unregister   remove that local test install
param([switch]$Register, [switch]$Unregister, [switch]$NoBuild)

$ErrorActionPreference = 'Stop'
$root   = $PSScriptRoot
$csc    = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$obj    = Join-Path $root 'obj'
$layout = Join-Path $obj 'msix'
$out    = Join-Path $root 'dist\store'
$cfg    = Get-Content (Join-Path $root 'store\store.json') -Raw -Encoding UTF8 | ConvertFrom-Json

if ($Unregister) {
    Get-AppxPackage -Name $cfg.IdentityName | ForEach-Object { Remove-AppxPackage $_.PackageFullName; Write-Host "Removed $($_.PackageFullName)" }
    return
}

# version from the app (Store versions are a.b.c.0)
$m = Select-String -Path (Join-Path $root 'src\Program.cs') -Pattern 'const string Version = "(\d+\.\d+\.\d+)"'
if (-not $m) { throw 'Version not found in src\Program.cs' }
$version = $m.Matches[0].Groups[1].Value + '.0'

# 1) Windows SDK build tools (makeappx, makepri)
$btVer = '10.0.28000.2705'
$bt = Join-Path $root "packages\sdk-buildtools.$btVer"
if (-not (Test-Path $bt)) {
    Write-Host "Downloading Microsoft.Windows.SDK.BuildTools $btVer from nuget.org ..."
    $nupkg = "$bt.zip"
    New-Item -ItemType Directory -Force (Split-Path $nupkg) | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.windows.sdk.buildtools/$btVer/microsoft.windows.sdk.buildtools.$btVer.nupkg" -OutFile $nupkg
    Expand-Archive -Path $nupkg -DestinationPath $bt -Force
    Remove-Item $nupkg
}
$makeappx = Get-ChildItem $bt -Recurse -Filter makeappx.exe | Where-Object { $_.FullName -match '\\x64\\' } | Select-Object -First 1 -ExpandProperty FullName
$makepri  = Get-ChildItem $bt -Recurse -Filter makepri.exe  | Where-Object { $_.FullName -match '\\x64\\' } | Select-Object -First 1 -ExpandProperty FullName
if (-not $makeappx -or -not $makepri) { throw "makeappx / makepri not found in $bt" }

# 2) the app
if (-not $NoBuild) { & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'build.ps1'); if ($LASTEXITCODE) { throw 'build.ps1 failed' } }
$exe = Join-Path $root 'dist\SuperSpeedNote.exe'
if (-not (Test-Path $exe)) { throw 'dist\SuperSpeedNote.exe missing - run build.ps1' }

# a test install runs straight from the layout folder: let it go first
$running = Get-Process SuperSpeedNote -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$layout*" }
if ($running) { Start-Process $running[0].Path -ArgumentList '--quit' -Wait; Start-Sleep -Seconds 2 }

# 3) layout: app, start-up helper, logos, manifest, resources.pri
if (Test-Path $layout) { Remove-Item $layout -Recurse -Force }
New-Item -ItemType Directory -Force $layout, $out | Out-Null
Copy-Item $exe $layout
& $csc /nologo /target:winexe /optimize+ "/out:$(Join-Path $layout 'SuperSpeedNoteStartup.exe')" "/win32icon:$(Join-Path $root 'assets\app.ico')" (Join-Path $root 'src\Startup.cs')
if ($LASTEXITCODE) { throw 'start-up helper compile failed' }
$gen = Join-Path $obj 'IconGen.exe'
& $csc /nologo /optimize+ "/out:$gen" /reference:System.Drawing.dll (Join-Path $root 'tools\IconGen.cs')
if ($LASTEXITCODE) { throw 'IconGen compile failed' }
& $gen --store (Join-Path $layout 'Assets')
if ($LASTEXITCODE) { throw 'store logos failed' }

$xml = (Get-Content (Join-Path $root 'store\AppxManifest.template.xml') -Raw -Encoding UTF8).
    Replace('{{NAME}}', $cfg.IdentityName).Replace('{{PUBLISHER}}', [Security.SecurityElement]::Escape($cfg.Publisher)).
    Replace('{{PUBLISHER_DISPLAY}}', [Security.SecurityElement]::Escape($cfg.PublisherDisplayName)).Replace('{{VERSION}}', $version)
[IO.File]::WriteAllText((Join-Path $layout 'AppxManifest.xml'), $xml, (New-Object Text.UTF8Encoding($false)))

$pricfg = Join-Path $obj 'priconfig.xml'
& $makepri createconfig /cf $pricfg /dq ko-KR /pv 10.0.0 /o | Out-Null
if ($LASTEXITCODE) { throw 'makepri createconfig failed' }
& $makepri new /pr $layout /cf $pricfg /mn (Join-Path $layout 'AppxManifest.xml') /of (Join-Path $layout 'resources.pri') /o | Out-Null
if ($LASTEXITCODE) { throw 'makepri new failed' }

# 4) pack (makeappx also checks the manifest against the schema)
$msix = Join-Path $out "SuperSpeedNote_${version}_x64.msix"
& $makeappx pack /d $layout /p $msix /o | Out-Null
if ($LASTEXITCODE) { throw 'makeappx pack failed' }
Write-Host ("OK -> {0} ({1:N0} KB)  identity: {2} / {3}" -f $msix, ((Get-Item $msix).Length / 1KB), $cfg.IdentityName, $cfg.Publisher)
if ($cfg.Publisher -eq 'CN=SuperSpeedNote Dev') { Write-Host 'Note: dev identity - paste your Partner Center values into store\store.json before uploading.' }

# 5) optional local test install of the unpacked layout (Developer Mode; no signing needed)
if ($Register) {
    Add-AppxPackage -Register (Join-Path $layout 'AppxManifest.xml') -ForceUpdateFromAnyVersion
    Write-Host "Registered for testing: Start menu > Super Speed Note   (remove: package.ps1 -Unregister)"
}
