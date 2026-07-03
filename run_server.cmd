@echo off
setlocal
powershell -STA -NoProfile -ExecutionPolicy Bypass -File "%~dp0docs-preview.ps1" %*
