@echo off
setlocal
cd /d "%~dp0"
title XFly

if not exist "node_modules\electron" (
  echo [XFly] Bagimliliklar yukleniyor, ilk calistirma biraz surebilir...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :err
)

if not exist "out\main\index.js" (
  echo [XFly] Derleniyor...
  call npm run build
  if errorlevel 1 goto :err
)

echo [XFly] Baslatiliyor...
call "node_modules\.bin\electron.cmd" .
goto :eof

:err
echo.
echo [XFly] HATA: kurulum/derleme basarisiz oldu.
pause
