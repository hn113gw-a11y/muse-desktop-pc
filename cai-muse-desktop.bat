@echo off
chcp 65001 >nul
title Cai Muse Desktop (de len ban cu)
cd /d "%~dp0"

echo [1/5] Kiem tra Node.js...
where node >nul 2>nul
if errorlevel 1 goto nonode

echo [2/5] Tat Muse Desktop dang chay (neu co)...
taskkill /f /im "Muse Desktop.exe" >nul 2>nul

echo [3/5] npm install...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm install
if errorlevel 1 goto fail

echo [4/5] Dong goi file cai dat (npm run dist)...
set WCS=%LOCALAPPDATA%\electron-builder\Cache\winCodeSign
if exist "%WCS%\winCodeSign-2.6.0\rcedit-x64.exe" goto dopack
echo Giai nen winCodeSign bo qua phan symlink macOS (khong can quyen admin)...
for %%F in ("%WCS%\*.7z") do "node_modules\7zip-bin\win\x64\7za.exe" x -y -bd "%%F" -o"%WCS%\winCodeSign-2.6.0" >nul 2>nul

:dopack
call npm run dist
if not errorlevel 1 goto built

echo.
echo Lan 1 loi, dang giai nen winCodeSign roi thu lai...
for %%F in ("%WCS%\*.7z") do "node_modules\7zip-bin\win\x64\7za.exe" x -y -bd "%%F" -o"%WCS%\winCodeSign-2.6.0" >nul 2>nul
call npm run dist
if errorlevel 1 goto fail

:built
echo [5/5] Cai de len ban cu...
set SETUP=
for /f "delims=" %%F in ('dir /b /o-d "dist\Muse Desktop Setup *.exe" 2^>nul') do if not defined SETUP set "SETUP=dist\%%F"
if not defined SETUP goto fail
taskkill /f /im "Muse Desktop.exe" >nul 2>nul
"%SETUP%" /S
echo.
echo XONG. Da cai %SETUP% de len ban cu.
pause
exit /b 0

:nonode
echo Chua co Node.js. Cai ban LTS tai https://nodejs.org roi chay lai file nay.
pause
exit /b 1

:fail
echo.
echo CO LOI o buoc tren. Chup man hinh nay gui lai cho Claude.
pause
exit /b 1
