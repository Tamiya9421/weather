@echo off
rem Start a local static web server for the weather PWA.
rem Access from this PC:   http://localhost:8080/
rem Access from iPhone:    http://<this-PC-IP>:8080/  (same Wi-Fi required)
setlocal
cd /d "%~dp0"

echo ============================================
echo   3-Spot Weather PWA - local server
echo ============================================
echo.
echo This PC IP address(es):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo    http://%%a:8080/
echo.
echo On iPhone (same Wi-Fi): open one of the URLs above in Safari.
echo Press Ctrl+C to stop.
echo.

py -3 -m http.server 8080
