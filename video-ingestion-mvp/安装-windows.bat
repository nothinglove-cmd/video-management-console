@echo off
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install\bootstrap-windows.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if "%EXIT_CODE%"=="0" (
  echo 安装程序已结束。可以关闭窗口，或双击“启动-windows.bat”启动系统。
) else (
  echo 安装程序没有完成，请查看上面的错误信息。
)
echo.
pause
exit /b %EXIT_CODE%
