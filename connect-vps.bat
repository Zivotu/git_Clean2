@echo off
REM ================================================
REM   THESARA VPS SSH CONNECTION
REM   Updated: 2025-12-14
REM   Port: 2222 (Custom SSH port for security)
REM ================================================

set HOST=178.218.160.180
set USER=root
set PORT=2222

echo ================================================
echo   THESARA VPS SSH CONNECTION
echo ================================================
echo Server: %HOST%
echo User:   %USER%
echo Port:   %PORT%
echo.
echo NOTE: SSH port changed from 22 to 2222 for security
echo (Prvi put će te pitati da prihvatiš fingerprint: upiši yes)
echo.
echo ================================================
echo.

ssh -p %PORT% %USER%@%HOST%

echo.
echo ================================================
echo   Connection closed.
echo ================================================
pause
