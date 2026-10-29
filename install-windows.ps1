# Scar the Hedgerec - Windows First-Time Auto-Installer & "scar.bat" / "scar.cmd" Generator
# Works identically when launched from Command Prompt (cmd.exe) OR PowerShell:
#   powershell -ExecutionPolicy Bypass -Command "iex (irm https://raw.githubusercontent.com/Protoevaneglium/Scar-the-Hedgerec/main/install-windows.ps1)"
# Or directly inside PowerShell:
#   iex (irm https://raw.githubusercontent.com/Protoevaneglium/Scar-the-Hedgerec/main/install-windows.ps1)

$ErrorActionPreference = 'Continue'
$RepoUrl      = 'https://github.com/Protoevaneglium/Scar-the-Hedgerec.git'
$ZipUrlMain   = 'https://github.com/Protoevaneglium/Scar-the-Hedgerec/archive/refs/heads/main.zip'
$ZipUrlMaster = 'https://github.com/Protoevaneglium/Scar-the-Hedgerec/archive/refs/heads/master.zip'

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Scar the Hedgerec - Windows First-Time Setup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check for Node.js (auto-install via winget on Windows 10/11 if missing)
$HasNode = [bool](Get-Command node -ErrorAction SilentlyContinue)
if (-not $HasNode -and (Test-Path "$env:ProgramFiles\nodejs\node.exe")) {
    $env:Path = "$env:ProgramFiles\nodejs;$env:Path"
    $HasNode = $true
}

if (-not $HasNode) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "Node.js not found - installing Node.js LTS via winget..." -ForegroundColor Yellow
        try {
            winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
            $MachinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
            $UserPath    = [Environment]::GetEnvironmentVariable('Path', 'User')
            $env:Path    = "$UserPath;$MachinePath;$env:Path;$env:ProgramFiles\nodejs"
        } catch {
            Write-Host "Note: Winget install encountered an issue. You can install Node.js manually from https://nodejs.org" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Note: Node.js was not detected. Install Node.js LTS from https://nodejs.org for full audio/server support." -ForegroundColor Yellow
    }
}

# 2. Determine target game directory:
# If running inside repo checkout, use it; otherwise default to %USERPROFILE%\Scar-the-Hedgerec
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } elseif (Test-Path 'server.js') { (Get-Location).Path } else { '' }
if ($ScriptDir -and (Test-Path (Join-Path $ScriptDir 'server.js'))) {
    $GameDir = (Resolve-Path $ScriptDir).Path
} else {
    $GameDir = Join-Path $env:USERPROFILE 'Scar-the-Hedgerec'
    $HasGit  = [bool](Get-Command git -ErrorAction SilentlyContinue)

    if (Test-Path (Join-Path $GameDir '.git')) {
        if ($HasGit) {
            Write-Host "Updating existing Scar the Hedgerec in $GameDir ..." -ForegroundColor Green
            try {
                git -C $GameDir fetch origin
                # Older installers overwrote the tracked launchers; restore them so pull can't conflict
                git -C $GameDir checkout -- scar.bat scar.cmd start-windows.bat 2>$null
                $CurrentBranch = (git -C $GameDir rev-parse --abbrev-ref HEAD 2>$null)
                if (-not $CurrentBranch -or $CurrentBranch -eq 'HEAD') { $CurrentBranch = 'master' }
                $Dirty = git -C $GameDir status --porcelain
                if (-not $Dirty) {
                    git -C $GameDir checkout -B $CurrentBranch "origin/$CurrentBranch" 2>$null
                    git -C $GameDir pull --ff-only origin $CurrentBranch 2>$null
                } else {
                    git -C $GameDir pull --rebase --autostash origin $CurrentBranch 2>$null
                }
            } catch {
                Write-Host "Git update encountered a minor warning, continuing..." -ForegroundColor Yellow
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
            $DownloadOk = $false
            foreach ($Url in @($ZipUrlMain, $ZipUrlMaster)) {
                try {
                    Invoke-WebRequest -Uri $Url -OutFile $TmpZip -UseBasicParsing -ErrorAction Stop
                    $DownloadOk = $true
                    break
                } catch {}
            }
            if (-not $DownloadOk) {
                throw "Could not download Scar the Hedgerec archive from GitHub."
            }
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

# 3. Generate the launcher scripts (`scar.bat` and `scar.cmd`)
$BatContent = @"
@echo off
REM Auto-generated launcher for Scar the Hedgerec
cd /d "$GameDir" || exit /b 1
set "NODE_BIN=node"
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
        set "NODE_BIN=%LOCALAPPDATA%\Programs\node\node.exe"
    ) else (
        set "NODE_BIN="
    )
)
if defined NODE_BIN (
    "%NODE_BIN%" server.js --open %*
) else (
    start "" "public\index.html"
)
"@

$TargetDirs = New-Object System.Collections.Generic.List[string]

# (The game folder already ships its own tracked scar.bat / scar.cmd - don't overwrite
#  them, or future `git pull` updates will conflict.)

# B) In %LOCALAPPDATA%\Microsoft\WindowsApps (Standard on Windows 10 & 11 - already in User PATH by default!)
if ($env:LOCALAPPDATA) {
    $WinAppsDir = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps'
    if (Test-Path $WinAppsDir) {
        $TargetDirs.Add($WinAppsDir)
    }
}

# C) In %USERPROFILE%\.local\bin (and ensure .local\bin is added to persistent User PATH)
$LocalBin = Join-Path $env:USERPROFILE '.local\bin'
if (-not (Test-Path $LocalBin)) {
    New-Item -ItemType Directory -Path $LocalBin -Force -ErrorAction SilentlyContinue | Out-Null
}
if (Test-Path $LocalBin) {
    $TargetDirs.Add($LocalBin)
}

$CurrentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $CurrentUserPath) { $CurrentUserPath = '' }
$PathParts = $CurrentUserPath -split ';' | Where-Object { $_ -ne '' }
if (-not ($PathParts | Where-Object { $_.TrimEnd('\') -ieq $LocalBin.TrimEnd('\') })) {
    $NewUserPath = if ($CurrentUserPath.Trim()) { "$CurrentUserPath;$LocalBin" } else { $LocalBin }
    [Environment]::SetEnvironmentVariable('Path', $NewUserPath, 'User')
    $env:Path = "$env:Path;$LocalBin"
}

# D) In %USERPROFILE% (Command Prompt default initial directory)
$TargetDirs.Add($env:USERPROFILE)

# E) In %APPDATA%\npm (in PATH whenever Node.js / npm has been used)
if ($env:APPDATA) {
    $NpmBin = Join-Path $env:APPDATA 'npm'
    if (-not (Test-Path $NpmBin)) {
        New-Item -ItemType Directory -Path $NpmBin -Force -ErrorAction SilentlyContinue | Out-Null
    }
    if (Test-Path $NpmBin) {
        $TargetDirs.Add($NpmBin)
    }
}

# Write `scar.bat` and `scar.cmd` to all target directories
foreach ($Dir in $TargetDirs) {
    if (Test-Path $Dir) {
        try {
            Set-Content -Path (Join-Path $Dir 'scar.bat') -Value $BatContent -Encoding ASCII -Force
            Set-Content -Path (Join-Path $Dir 'scar.cmd') -Value $BatContent -Encoding ASCII -Force
        } catch {}
    }
}

# Register immediate function in active PowerShell session so typing `scar` works right now
function global:scar {
    Set-Location $GameDir
    if (Get-Command node -ErrorAction SilentlyContinue) {
        node server.js --open $args
    } elseif (Test-Path "$env:ProgramFiles\nodejs\node.exe") {
        & "$env:ProgramFiles\nodejs\node.exe" server.js --open $args
    } else {
        Start-Process "public\index.html"
    }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Scar the Hedgerec is installed on Windows!" -ForegroundColor Green
Write-Host " Game directory : $GameDir"
Write-Host " Command created: scar (and scar.bat / scar.cmd)"
Write-Host ""
Write-Host " HOW TO START EVERY TIME:" -ForegroundColor Yellow
Write-Host " Open Command Prompt (cmd) or PowerShell and simply type:"
Write-Host ""
Write-Host "     scar" -ForegroundColor White
Write-Host ""
Write-Host " and press Enter - it launches the local server and opens"
Write-Host " the game in your web browser automatically!"
Write-Host "==========================================================" -ForegroundColor Green
