@echo off
REM Auto-generated launcher for Scar the Hedgerec
cd /d "%~dp0" || exit /b 1
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
