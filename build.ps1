# Super Speed Note build script
# - Uses the C# compiler that ships with Windows (.NET Framework 4.x) - no SDK install needed.
# - Downloads the Microsoft WebView2 SDK package from nuget.org once (cached in .\packages).
# Usage:  powershell -ExecutionPolicy Bypass -File build.ps1 [-Icon]

param([switch]$Icon)

$ErrorActionPreference = 'Stop'
$root   = $PSScriptRoot
$csc    = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$wv2Ver = '1.0.4258.31'
$pkgDir = Join-Path $root "packages\webview2.$wv2Ver"
$dist   = Join-Path $root 'dist'
$assets = Join-Path $root 'assets'
$obj    = Join-Path $root 'obj'

if (-not (Test-Path $csc)) { throw "csc.exe not found: $csc" }
New-Item -ItemType Directory -Force $dist, $assets, $obj | Out-Null

# 1) WebView2 SDK
$coreDll   = Join-Path $pkgDir 'lib\net462\Microsoft.Web.WebView2.Core.dll'
$loaderDll = Join-Path $pkgDir 'runtimes\win-x64\native\WebView2Loader.dll'
if (-not (Test-Path $coreDll)) {
    Write-Host "Downloading WebView2 SDK $wv2Ver from nuget.org ..."
    $nupkg = Join-Path $root "packages\webview2.$wv2Ver.zip"
    New-Item -ItemType Directory -Force (Split-Path $nupkg) | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$wv2Ver/microsoft.web.webview2.$wv2Ver.nupkg" -OutFile $nupkg
    Expand-Archive -Path $nupkg -DestinationPath $pkgDir -Force
    Remove-Item $nupkg
}

# 2) App icon (navy -> white gradient, "Super Speed" logo)
$ico = Join-Path $assets 'app.ico'
if ($Icon -or -not (Test-Path $ico)) {
    Write-Host 'Generating icon ...'
    $gen = Join-Path $obj 'IconGen.exe'
    & $csc /nologo /optimize+ /out:$gen /reference:System.Drawing.dll (Join-Path $root 'tools\IconGen.cs')
    if ($LASTEXITCODE) { throw 'IconGen compile failed' }
    & $gen $ico $assets
    if ($LASTEXITCODE) { throw 'IconGen failed' }
}

# 3) A running copy locks the exe: ask it to save and exit first. Notes live in %APPDATA%, never in dist\,
#    so rebuilding never touches them. (v1.0 builds don't know the quit message: hiding them saves, then stop.)
$running = Get-Process SuperSpeedNote -ErrorAction SilentlyContinue
if ($running) {
    Write-Host 'Asking the running app to save and exit ...'
    Add-Type -Namespace SSN -Name W -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int RegisterWindowMessage(string s);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l);
'@
    [SSN.W]::PostMessage([IntPtr]0xFFFF, [SSN.W]::RegisterWindowMessage('SuperSpeedNote.Quit'), [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    $running | ForEach-Object { $_.WaitForExit(5000) | Out-Null }
    $still = Get-Process SuperSpeedNote -ErrorAction SilentlyContinue
    if ($still) {
        $still | ForEach-Object { $_.CloseMainWindow() | Out-Null }
        Start-Sleep -Seconds 2
        $still | Stop-Process -Force
    }
}

# 4) App
Write-Host 'Compiling SuperSpeedNote.exe ...'
$out = Join-Path $dist 'SuperSpeedNote.exe'
$cscArgs = @(
    '/nologo', '/codepage:65001', '/target:winexe', '/platform:x64', '/optimize+', '/debug-',
    "/out:$out",
    "/win32icon:$ico",
    "/win32manifest:$(Join-Path $root 'src\app.manifest')",
    '/reference:System.dll', '/reference:System.Core.dll',
    '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
    "/reference:$coreDll",
    "/resource:$(Join-Path $root 'src\ui\index.html'),SSN.index.html",
    "/resource:$ico,SSN.app.ico",
    "/resource:$coreDll,SSN.WebView2.Core.dll",
    "/resource:$loaderDll,SSN.WebView2Loader.dll",
    (Join-Path $root 'src\Program.cs')
)
& $csc @cscArgs
if ($LASTEXITCODE) { throw 'Compile failed' }

$size = [math]::Round((Get-Item $out).Length / 1KB)
Write-Host "OK -> $out ($size KB, single file)"
