@echo off
setlocal
REM Scar the Hedgerec - Local Windows Installer & Global "scar.bat" Generator
REM Double-click this file (or run `install-windows.bat` in CMD) to create the
REM global `scar` / `scar.bat` command pointing to this game folder!

set "GAME_DIR=%~dp0"
if "%GAME_DIR:~-1%"=="\" set "GAME_DIR=%GAME_DIR:~0,-1%"

set "QUIET=0"
if /I "%~1"=="--quiet" set "QUIET=1"

set "HOME_BAT=%USERPROFILE%\scar.bat"
set "LOCAL_BIN=%USERPROFILE%\.local\bin"
set "LOCAL_BIN_BAT=%LOCAL_BIN%\scar.bat"
set "NPM_BIN=%APPDATA%\npm"
set "NPM_BAT=%NPM_BIN%\scar.bat"

if not exist "%LOCAL_BIN%" mkdir "%LOCAL_BIN%" >nul 2>nul

call :WriteLauncher "%HOME_BAT%"
call :WriteLauncher "%LOCAL_BIN_BAT%"

if defined APPDATA (
    if not exist "%NPM_BIN%" mkdir "%NPM_BIN%" >nul 2>nul
    if exist "%NPM_BIN%" call :WriteLauncher "%NPM_BAT%"
)

REM Ensure %USERPROFILE%\.local\bin is on the persistent Windows User PATH
powershell -NoProfile -ExecutionPolicy Bypass -Command "$b='%LOCAL_BIN%'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){$p=''}; if(($p -split ';') -notcontains $b){ [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';' + $b).TrimStart(';'), 'User') }" >nul 2>nul

if "%QUIET%"=="0" (
    echo.
    echo ==========================================================
    echo  Scar the Hedgerec - Windows Launcher Installed!
    echo  Game folder    : %GAME_DIR%
    echo  Generated .bat : %HOME_BAT%
    echo                   %LOCAL_BIN_BAT%
    echo.
    echo  HOW TO START EVERY TIME:
    echo  Open Command Prompt ^(cmd^) or PowerShell and type:
    echo.
    echo      scar
    echo.
    echo  ^(or type: scar.bat^) and press Enter!
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
    echo where node ^>nul 2^>nul
    echo if %%ERRORLEVEL%% EQU 0 ^(
    echo     node server.js --open %%*
    echo ^) else ^(
    echo     start "" "public\index.html"
    echo ^)
) > "%~1"
exit /b 0
