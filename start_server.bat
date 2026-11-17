@echo off
setlocal
cd /d "%~dp0"
title Khmer Dropshipping Team Hub
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    python server.py
  ) else (
    echo Python 3 was not found. Install Python 3.10 or newer and try again.
    pause
    exit /b 1
  )
)
if errorlevel 1 pause
endlocal
