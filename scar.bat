@echo off
REM Scar the Hedgerec - Quick "scar" Launcher (Windows)
REM Also registers the global `scar` command on first launch.
cd /d "%~dp0"
if not exist "%LOCALAPPDATA%\Microsoft\WindowsApps\scar.bat" if exist "%~dp0install-windows.bat" call "%~dp0install-windows.bat" --quiet >nul 2>nul
set "NODE_BIN=node"
where node >nul 2>nul
if errorlevel 1 set "NODE_BIN="
if not defined NODE_BIN if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_BIN if exist "%LOCALAPPDATA%\Programs\node\node.exe" set "NODE_BIN=%LOCALAPPDATA%\Programs\node\node.exe"
if defined NODE_BIN (
    "%NODE_BIN%" server.js --open %*
) else (
    start "" "public\index.html"
)
