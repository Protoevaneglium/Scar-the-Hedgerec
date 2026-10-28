@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node server.js --open
) else (
    start "" "public\index.html"
)
