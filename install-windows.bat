@echo off
setlocal
REM Scar the Hedgerec - Local Windows Installer & Global "scar" Command Generator
REM Double-click this file (or run `install-windows.bat` in CMD) to register the
REM global `scar` / `scar.bat` command pointing to this game folder!

set "GAME_DIR=%~dp0"
if "%GAME_DIR:~-1%"=="\" set "GAME_DIR=%GAME_DIR:~0,-1%"

set "QUIET=0"
if /I "%~1"=="--quiet" set "QUIET=1"

set "LOCAL_BIN=%USERPROFILE%\.local\bin"
set "WIN_APPS=%LOCALAPPDATA%\Microsoft\WindowsApps"
set "NPM_BIN=%APPDATA%\npm"

if not exist "%LOCAL_BIN%" mkdir "%LOCAL_BIN%" >nul 2>nul
if not exist "%WIN_APPS%" mkdir "%WIN_APPS%" >nul 2>nul

call :WriteLauncher "%USERPROFILE%\scar.bat"
call :WriteLauncher "%USERPROFILE%\scar.cmd"
call :WriteLauncher "%LOCAL_BIN%\scar.bat"
call :WriteLauncher "%LOCAL_BIN%\scar.cmd"

if exist "%WIN_APPS%" (
    call :WriteLauncher "%WIN_APPS%\scar.bat"
    call :WriteLauncher "%WIN_APPS%\scar.cmd"
)

if defined APPDATA (
    if not exist "%NPM_BIN%" mkdir "%NPM_BIN%" >nul 2>nul
    if exist "%NPM_BIN%" (
        call :WriteLauncher "%NPM_BIN%\scar.bat"
        call :WriteLauncher "%NPM_BIN%\scar.cmd"
    )
)

REM Ensure %USERPROFILE%\.local\bin is on the persistent Windows User PATH
powershell -NoProfile -ExecutionPolicy Bypass -Command "$b='%LOCAL_BIN%'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){$p=''}; if(($p -split ';') -notcontains $b){ [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';' + $b).TrimStart(';'), 'User') }" >nul 2>nul

if "%QUIET%"=="0" (
    echo.
    echo ==========================================================
    echo  Scar the Hedgerec - Windows Launcher Installed!
    echo  Game folder    : %GAME_DIR%
    echo  Command created: scar ^(and scar.bat / scar.cmd^)
    echo.
    echo  HOW TO START EVERY TIME:
    echo  Open Command Prompt ^(cmd^) or PowerShell and type:
    echo.
    echo      scar
    echo.
    echo  and press Enter!
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
    echo if %%ERRORLEVEL%% NEQ 0 ^(
    echo     if exist "%%ProgramFiles%%\nodejs\node.exe" ^(
    echo         set "NODE_BIN=%%ProgramFiles%%\nodejs\node.exe"
    echo     ^) else if exist "%%ProgramFiles^(x86^)%%\nodejs\node.exe" ^(
    echo         set "NODE_BIN=%%ProgramFiles^(x86^)%%\nodejs\node.exe"
    echo     ^) else if exist "%%LOCALAPPDATA%%\Programs\node\node.exe" ^(
    echo         set "NODE_BIN=%%LOCALAPPDATA%%\Programs\node\node.exe"
    echo     ^) else ^(
    echo         set "NODE_BIN="
    echo     ^)
    echo ^)
    echo if defined NODE_BIN ^(
    echo     "%%NODE_BIN%%" server.js --open %%*
    echo ^) else ^(
    echo     start "" "public\index.html"
    echo ^)
) > "%~1" 2>nul
exit /b 0
