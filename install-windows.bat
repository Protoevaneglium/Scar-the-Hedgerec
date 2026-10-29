@echo off
setlocal
REM Scar the Hedgerec - Windows Installer & Global "scar" Command Generator
REM Pure batch: does NOT need to launch PowerShell (works even when security
REM software blocks powershell.exe with "Access is denied").
REM
REM Usage:
REM   * Inside a cloned/unzipped repo: double-click install-windows.bat
REM   * From anywhere in Command Prompt (one-liner, downloads the game):
REM       curl -fsSL -o "%TEMP%\scar-install.bat" https://raw.githubusercontent.com/Protoevaneglium/Scar-the-Hedgerec/main/install-windows.bat && "%TEMP%\scar-install.bat"

set "REPO_URL=https://github.com/Protoevaneglium/Scar-the-Hedgerec.git"
set "ZIP_URL=https://github.com/Protoevaneglium/Scar-the-Hedgerec/archive/refs/heads/master.zip"

set "QUIET=0"
if /I "%~1"=="--quiet" set "QUIET=1"

if "%QUIET%"=="0" (
    echo.
    echo ==========================================================
    echo  Scar the Hedgerec - Windows Setup
    echo ==========================================================
)

REM ---- 1. Locate or download the game folder ----
set "SELF_DIR=%~dp0"
if exist "%SELF_DIR%server.js" (
    set "GAME_DIR=%SELF_DIR:~0,-1%"
    goto :HaveGame
)

set "GAME_DIR=%USERPROFILE%\Scar-the-Hedgerec"

where git >nul 2>nul
if errorlevel 1 goto :ZipInstall

if exist "%GAME_DIR%\.git" (
    echo Updating existing Scar the Hedgerec in %GAME_DIR% ...
    REM Older installers overwrote the tracked launchers; restore them so pull can't conflict
    git -C "%GAME_DIR%" checkout -- scar.bat scar.cmd start-windows.bat >nul 2>nul
    git -C "%GAME_DIR%" pull --rebase --autostash
    goto :HaveGame
)
if exist "%GAME_DIR%\server.js" goto :ZipInstall
echo Cloning Scar the Hedgerec into %GAME_DIR% ...
git clone "%REPO_URL%" "%GAME_DIR%"
if exist "%GAME_DIR%\server.js" goto :HaveGame

:ZipInstall
echo Downloading latest Scar the Hedgerec archive into %GAME_DIR% ...
set "TMP_ZIP=%TEMP%\scar-hedgerec-%RANDOM%.zip"
set "TMP_EXT=%TEMP%\scar-hedgerec-ext-%RANDOM%"
curl -fsSL -o "%TMP_ZIP%" "%ZIP_URL%"
if errorlevel 1 (
    echo ERROR: Could not download the game. Check your internet connection.
    exit /b 1
)
mkdir "%TMP_EXT%" >nul 2>nul
tar -xf "%TMP_ZIP%" -C "%TMP_EXT%"
if errorlevel 1 (
    echo ERROR: Could not extract the game archive.
    exit /b 1
)
if not exist "%GAME_DIR%" mkdir "%GAME_DIR%"
for /d %%D in ("%TMP_EXT%\*") do xcopy "%%~fD\*" "%GAME_DIR%\" /E /I /Y /Q >nul
del /q "%TMP_ZIP%" >nul 2>nul
rmdir /s /q "%TMP_EXT%" >nul 2>nul
if not exist "%GAME_DIR%\server.js" (
    echo ERROR: Download finished but server.js is missing in %GAME_DIR%.
    exit /b 1
)

:HaveGame

REM ---- 2. Node.js check (optional auto-install via winget) ----
where node >nul 2>nul
if not errorlevel 1 goto :NodeOk
if exist "%ProgramFiles%\nodejs\node.exe" goto :NodeOk
where winget >nul 2>nul
if errorlevel 1 (
    echo Note: Node.js not found. Install Node.js LTS from https://nodejs.org for full audio/server support.
    goto :NodeOk
)
echo Node.js not found - installing Node.js LTS via winget...
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
:NodeOk

REM ---- 3. Write global launchers ----
REM %LOCALAPPDATA%\Microsoft\WindowsApps is on the user PATH by default on Windows 10/11,
REM so `scar` works in any new cmd / PowerShell window without editing PATH.
set "WIN_APPS=%LOCALAPPDATA%\Microsoft\WindowsApps"
set "LOCAL_BIN=%USERPROFILE%\.local\bin"
set "NPM_BIN=%APPDATA%\npm"

if not exist "%WIN_APPS%" mkdir "%WIN_APPS%" >nul 2>nul
if not exist "%LOCAL_BIN%" mkdir "%LOCAL_BIN%" >nul 2>nul
if not exist "%NPM_BIN%" mkdir "%NPM_BIN%" >nul 2>nul

for %%T in ("%WIN_APPS%" "%LOCAL_BIN%" "%NPM_BIN%" "%USERPROFILE%") do (
    if exist "%%~T" (
        call :WriteLauncher "%%~T\scar.bat"
        call :WriteLauncher "%%~T\scar.cmd"
    )
)

if "%QUIET%"=="0" (
    echo.
    echo ==========================================================
    echo  Scar the Hedgerec is installed!
    echo  Game folder : %GAME_DIR%
    echo.
    echo  HOW TO START EVERY TIME:
    echo  Open a NEW Command Prompt or PowerShell window and type:
    echo.
    echo      scar
    echo.
    echo  Press Ctrl+C in that window to stop the server.
    echo ==========================================================
    echo.
)
endlocal
exit /b 0

:WriteLauncher
(
    echo @echo off
    echo REM Auto-generated launcher for Scar the Hedgerec
    echo cd /d "%GAME_DIR%" ^|^| exit /b 1
    echo set "NODE_BIN=node"
    echo where node ^>nul 2^>nul
    echo if errorlevel 1 set "NODE_BIN="
    echo if not defined NODE_BIN if exist "%%ProgramFiles%%\nodejs\node.exe" set "NODE_BIN=%%ProgramFiles%%\nodejs\node.exe"
    echo if not defined NODE_BIN if exist "%%LOCALAPPDATA%%\Programs\node\node.exe" set "NODE_BIN=%%LOCALAPPDATA%%\Programs\node\node.exe"
    echo if defined NODE_BIN ^(
    echo     "%%NODE_BIN%%" server.js --open %%*
    echo ^) else ^(
    echo     start "" "public\index.html"
    echo ^)
) > "%~1" 2>nul
exit /b 0
