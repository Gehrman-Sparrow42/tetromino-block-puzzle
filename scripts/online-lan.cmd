@echo off
title Afterblock - Phone and PC Playtest
cd /d "%~dp0.."
set ONLINE_LAN=1
if not defined ONLINE_PORT set ONLINE_PORT=8172
echo Afterblock LAN playtest. Keep both devices on the same Wi-Fi.
echo Phone addresses will appear after the build. Close the server to stop hosting.
call npm run online:lan
if errorlevel 1 pause
