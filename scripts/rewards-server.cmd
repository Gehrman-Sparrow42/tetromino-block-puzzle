@echo off
title Afterblock - Rewarded Ad Backend
cd /d "%~dp0.."
call npm run rewards:server
if errorlevel 1 pause
