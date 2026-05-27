@echo off
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install\start-windows.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo 系统已停止。
echo.
pause
exit /b %EXIT_CODE%
