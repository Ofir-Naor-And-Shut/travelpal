@echo off
setlocal EnableExtensions
title TravelPal
cd /d "%~dp0"

set "PORT=5173"
set "URL=http://localhost:%PORT%"

echo(
echo   TravelPal
echo   =========
echo(

REM ---------------------------------------------------------------------------
REM  Find Node and npm. They are often missing from PATH in a shell that was
REM  opened before Node was installed, so fall back to the install locations.
REM ---------------------------------------------------------------------------
set "NODE="
for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE set "NODE=%%I"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

set "NPM="
for /f "delims=" %%I in ('where npm.cmd 2^>nul') do if not defined NPM set "NPM=%%I"
if not defined NPM if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM=%ProgramFiles%\nodejs\npm.cmd"

if not defined NODE (
  echo   Node.js was not found on this computer.
  echo   Install it from https://nodejs.org then run this file again.
  echo(
  pause
  exit /b 1
)

REM ---------------------------------------------------------------------------
REM  If the server is already up, skip straight to opening the page.
REM ---------------------------------------------------------------------------
call :isUp
if not errorlevel 1 (
  echo   Already running - opening the page...
  start "" "%URL%"
  exit /b 0
)

REM ---------------------------------------------------------------------------
REM  First run installs dependencies. Done in a subroutine because %NPM% inside
REM  a parenthesised block would expand before the block ever runs.
REM ---------------------------------------------------------------------------
if not exist "node_modules\vite\bin\vite.js" (
  call :installDeps
  if errorlevel 1 exit /b 1
)

REM ---------------------------------------------------------------------------
REM  Start the server in its own minimised window, then wait for it to answer.
REM ---------------------------------------------------------------------------
echo   Starting the server...
start "TravelPal server" /min "%NODE%" "node_modules\vite\bin\vite.js" --port %PORT% --strictPort

call :waitUp
if errorlevel 1 (
  echo(
  echo   The server did not respond in time.
  echo   Look at the minimised "TravelPal server" window for errors.
  echo(
  pause
  exit /b 1
)

start "" "%URL%"

echo(
echo   Opened %URL%
echo(
echo   The server stays running in the minimised window titled
echo   "TravelPal server" - close it when you are done.
echo(
REM  `timeout` refuses to run when stdin is redirected; ping always works.
ping -n 6 127.0.0.1 >nul 2>nul
exit /b 0

REM ===========================================================================
:installDeps
if not defined NPM (
  echo   npm was not found, so dependencies cannot be installed.
  echo(
  pause
  exit /b 1
)
echo   Installing dependencies. This happens once and takes a minute...
echo(
call "%NPM%" install
if errorlevel 1 (
  echo(
  echo   Dependency install failed - see the messages above.
  echo(
  pause
  exit /b 1
)
exit /b 0

REM ---------------------------------------------------------------------------
REM  Health checks.
REM
REM  These speak HTTP rather than opening a raw socket. Vite binds IPv6 loopback
REM  ([::1]) by default, and a bare .NET TcpClient is IPv4-only, so a socket
REM  probe of 127.0.0.1 reports "down" against a perfectly healthy server.
REM  Going through Invoke-WebRequest uses the normal resolver - the same path
REM  the browser takes - and also proves the app is actually being served.
REM ---------------------------------------------------------------------------

:isUp
powershell -NoProfile -Command "try{ Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 }catch{ exit 1 }" >nul 2>nul
exit /b %errorlevel%

:waitUp
powershell -NoProfile -Command "for($i=0;$i -lt 90;$i++){ try{ Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 }catch{ Start-Sleep -Milliseconds 500 } }; exit 1" >nul 2>nul
exit /b %errorlevel%
