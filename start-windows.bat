@echo off
REM Scar the Hedgerec - Windows Launcher
cd /d "%~dp0"
if exist "%~dp0install-windows.bat" (
    if not exist "%USERPROFILE%\scar.bat" (
        call "%~dp0install-windows.bat" --quiet >nul 2>nul
    )
)
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node server.js --open %*
) else (
    start "" "public\index.html"
)
