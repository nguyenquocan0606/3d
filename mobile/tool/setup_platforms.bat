@echo off
REM Sinh phan native (android/, ios/) va va san cau hinh can thiet cho app.
REM Ban Windows cua tool/setup_platforms.sh.
REM
REM   cd mobile
REM   tool\setup_platforms.bat
REM
REM Luu y: thu muc ios/ sinh duoc tren Windows, nhung BUILD/CHAY iOS bat buoc macOS + Xcode.

setlocal
cd /d "%~dp0.."

where flutter >nul 2>nul
if errorlevel 1 (
  echo [X] Khong tim thay Flutter SDK trong PATH.
  exit /b 1
)

echo [1/4] Sao luu ma nguon...
if exist "%TEMP%\manage3d_backup" rmdir /s /q "%TEMP%\manage3d_backup"
mkdir "%TEMP%\manage3d_backup"
xcopy lib "%TEMP%\manage3d_backup\lib" /e /i /q >nul
copy pubspec.yaml "%TEMP%\manage3d_backup\" >nul
if exist analysis_options.yaml copy analysis_options.yaml "%TEMP%\manage3d_backup\" >nul

echo [2/4] Sinh scaffold native (android + ios)...
call flutter create . --project-name manage3d --org click.quocan --platforms=android,ios --overwrite

echo [3/4] Khoi phuc ma nguon va va cau hinh...
xcopy "%TEMP%\manage3d_backup\lib" lib /e /i /q /y >nul
copy "%TEMP%\manage3d_backup\pubspec.yaml" . >nul
if exist "%TEMP%\manage3d_backup\analysis_options.yaml" copy "%TEMP%\manage3d_backup\analysis_options.yaml" . >nul
rmdir /s /q "%TEMP%\manage3d_backup"

python tool\patch_platforms.py
if errorlevel 1 (
  echo [X] Va cau hinh that bai. Kiem tra da cai python3 chua.
  exit /b 1
)

echo [4/4] Tai dependencies...
call flutter pub get

echo.
echo [OK] Xong.
echo   flutter run                  - chay tren thiet bi dang cam
echo   flutter build apk --release  - dong goi Android
echo   (iOS: copy thu muc nay sang may Mac roi chay "flutter build ipa")
endlocal
