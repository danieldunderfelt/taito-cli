@echo off
:: Launcher script that runs the correct platform-specific binary for Windows

setlocal

set "SCRIPT_DIR=%~dp0"
set "DIST_DIR=%SCRIPT_DIR%..\dist"

:: Windows is always x64 for now (we only build windows-x64)
set "BINARY_NAME=taito-windows-x64.exe"
set "BINARY_PATH=%DIST_DIR%\%BINARY_NAME%"

if not exist "%BINARY_PATH%" (
  echo taito-cli: Binary not found: %BINARY_PATH% >&2
  echo Try reinstalling: npm install -g taito-cli >&2
  exit /b 1
)

:: Execute the binary with all arguments passed through
"%BINARY_PATH%" %*
