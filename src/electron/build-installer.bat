@echo off
echo Starting Electron Build...
echo.
echo NOTE: If this fails with "Cannot create symbolic link", please right-click this file and select "Run as Administrator".
echo.

npm run package
if %errorlevel% neq 0 (
    echo.
    echo BUILD FAILED!
    echo.
    echo Common Fix:
    echo 1. Run this script as Administrator.
    echo 2. Enable "Developer Mode" in Windows Settings.
    echo.
    pause
    exit /b %errorlevel%
)

echo.
echo Build Successful! Installer is in dist-installer/
pause
