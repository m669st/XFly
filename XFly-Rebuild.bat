@echo off
setlocal
cd /d "%~dp0"
title XFly - Rebuild

echo [XFly] Yeniden derleniyor...
call npm run build
if errorlevel 1 goto :err

echo [XFly] Baslatiliyor...
call "node_modules\.bin\electron.cmd" .
goto :eof

:err
echo.
echo [XFly] HATA: derleme basarisiz oldu.
pause
