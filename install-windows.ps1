# Scar the Hedgerec - Windows First-Time Auto-Installer & "scar.bat" Generator
# Works identically when launched from Command Prompt (cmd.exe) OR PowerShell:
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/Protoevaneglium/Scar-the-Hedgerec/main/install-windows.ps1 | iex"

$ErrorActionPreference = 'Stop'
$RepoUrl = 'https://github.com/Protoevaneglium/Scar-the-Hedgerec.git'
$ZipUrl  = 'https://github.com/Protoevaneglium/Scar-the-Hedgerec/archive/refs/heads/main.zip'

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Scar the Hedgerec - Windows First-Time Setup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check for Node.js (auto-install via winget on Windows 10/11 if missing)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "Node.js not found - installing Node.js LTS via winget..." -ForegroundColor Yellow
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        $MachinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
        $UserPath    = [Environment]::GetEnvironmentVariable('Path', 'User')
        $env:Path    = "$UserPath;$MachinePath"
    } else {
        Write-Host "Note: Node.js was not detected. Install Node.js LTS from https://nodejs.org for full audio/server support." -ForegroundColor Yellow
    }
}

# 2. Determine target game directory (use current directory if running inside repo, else %USERPROFILE%\Scar-the-Hedgerec)
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { '' }
if ($ScriptDir -and (Test-Path (Join-Path $ScriptDir 'server.js'))) {
    $GameDir = (Resolve-Path $ScriptDir).Path
} else {
    $GameDir = Join-Path $env:USERPROFILE 'Scar-the-Hedgerec'
    $HasGit  = [bool](Get-Command git -ErrorAction SilentlyContinue)

    if (Test-Path (Join-Path $GameDir '.git')) {
        if ($HasGit) {
            Write-Host "Updating existing Scar the Hedgerec in $GameDir ..." -ForegroundColor Green
            git -C $GameDir fetch origin main
            $Dirty = git -C $GameDir status --porcelain
            if (-not $Dirty) {
                git -C $GameDir checkout -B main origin/main
            } else {
                git -C $GameDir pull --rebase --autostash origin main
            }
        }
    } elseif ($HasGit -and -not (Test-Path $GameDir)) {
        Write-Host "Cloning Scar the Hedgerec into $GameDir ..." -ForegroundColor Green
        git clone $RepoUrl $GameDir
    } else {
        Write-Host "Downloading latest Scar the Hedgerec archive into $GameDir ..." -ForegroundColor Green
        $TmpZip = Join-Path ([IO.Path]::GetTempPath()) "scar-hedgerec-$([Guid]::NewGuid().ToString('N')).zip"
        $TmpExt = Join-Path ([IO.Path]::GetTempPath()) "scar-hedgerec-ext-$([Guid]::NewGuid().ToString('N'))"
        try {
            Invoke-WebRequest -Uri $ZipUrl -OutFile $TmpZip -UseBasicParsing
            Expand-Archive -Path $TmpZip -DestinationPath $TmpExt -Force
            $Inner = Get-ChildItem -Path $TmpExt -Directory | Select-Object -First 1
            if (-not (Test-Path $GameDir)) {
                New-Item -ItemType Directory -Path $GameDir -Force | Out-Null
            }
            Copy-Item -Path (Join-Path $Inner.FullName '*') -Destination $GameDir -Recurse -Force
        } finally {
            Remove-Item $TmpZip -Force -ErrorAction SilentlyContinue
            Remove-Item $TmpExt -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# 3. Generate the global `scar.bat` launcher so typing `scar` or `scar.bat` works from anywhere!
$BatContent = @"
@echo off
REM Auto-generated launcher for Scar the Hedgerec
cd /d "$GameDir" || exit /b 1
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node server.js --open %*
) else (
    start "" "public\index.html"
)
"@

$CreatedPaths = New-Object System.Collections.Generic.List[string]

# A) Inside the game folder itself
$LocalGameBat = Join-Path $GameDir 'scar.bat'
Set-Content -Path $LocalGameBat -Value $BatContent -Encoding ASCII
$CreatedPaths.Add($LocalGameBat)

# B) In %USERPROFILE%\scar.bat (default starting folder when opening Windows Command Prompt!)
$HomeBat = Join-Path $env:USERPROFILE 'scar.bat'
Set-Content -Path $HomeBat -Value $BatContent -Encoding ASCII
$CreatedPaths.Add($HomeBat)

# C) In %USERPROFILE%\.local\bin\scar.bat (and ensure .local\bin is in Windows User PATH)
$LocalBin = Join-Path $env:USERPROFILE '.local\bin'
if (-not (Test-Path $LocalBin)) {
    New-Item -ItemType Directory -Path $LocalBin -Force | Out-Null
}
$LocalBinBat = Join-Path $LocalBin 'scar.bat'
Set-Content -Path $LocalBinBat -Value $BatContent -Encoding ASCII
$CreatedPaths.Add($LocalBinBat)

$CurrentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $CurrentUserPath) { $CurrentUserPath = '' }
$PathParts = $CurrentUserPath -split ';' | Where-Object { $_ -ne '' }
if (-not ($PathParts | Where-Object { $_.TrimEnd('\') -ieq $LocalBin.TrimEnd('\') })) {
    $NewUserPath = if ($CurrentUserPath.Trim()) { "$CurrentUserPath;$LocalBin" } else { $LocalBin }
    [Environment]::SetEnvironmentVariable('Path', $NewUserPath, 'User')
}

# D) In %APPDATA%\npm\scar.bat (already in active PATH whenever Node.js is installed on Windows!)
if ($env:APPDATA) {
    $NpmBin = Join-Path $env:APPDATA 'npm'
    if (-not (Test-Path $NpmBin)) {
        New-Item -ItemType Directory -Path $NpmBin -Force -ErrorAction SilentlyContinue | Out-Null
    }
    if (Test-Path $NpmBin) {
        $NpmBat = Join-Path $NpmBin 'scar.bat'
        Set-Content -Path $NpmBat -Value $BatContent -Encoding ASCII
        $CreatedPaths.Add($NpmBat)
    }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Scar the Hedgerec is installed on Windows!" -ForegroundColor Green
Write-Host " Game directory : $GameDir"
Write-Host " Generated .bat : $HomeBat"
Write-Host "                  $LocalBinBat"
Write-Host ""
Write-Host " HOW TO START EVERY TIME:" -ForegroundColor Yellow
Write-Host " Open Command Prompt (cmd) or PowerShell and type:"
Write-Host ""
Write-Host "     scar" -ForegroundColor White
Write-Host ""
Write-Host " (or type: scar.bat) and press Enter - it launches the"
Write-Host " server and opens the game in your browser automatically!"
Write-Host "==========================================================" -ForegroundColor Green
