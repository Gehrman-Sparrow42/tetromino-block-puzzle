@echo off
title Afterblock - Online Development Server
cd /d "%~dp0.."
if not defined ONLINE_PORT set ONLINE_PORT=8172
echo Local server health: http://127.0.0.1:%ONLINE_PORT%/health
echo Press Ctrl+C to stop.
call npm run online:server
if errorlevel 1 pause
