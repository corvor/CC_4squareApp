@echo off
title FutureProof Careers - DEMO
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed yet.
  echo Download the LTS version from https://nodejs.org , install it, then double-click this file again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b
)
node scripts\dev-server.mjs --demo
pause
