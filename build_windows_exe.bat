@echo off
setlocal

cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python が見つかりません。Python 3 をインストールしてください。
  pause
  exit /b 1
)

python -m PyInstaller --version >nul 2>nul
if errorlevel 1 (
  echo PyInstaller をインストールします...
  python -m pip install pyinstaller
  if errorlevel 1 (
    echo PyInstaller のインストールに失敗しました。
    pause
    exit /b 1
  )
)

python -m PyInstaller --onefile --noconsole --name DepenDrap_Online launcher_windows.py
if errorlevel 1 (
  echo exe の作成に失敗しました。
  pause
  exit /b 1
)

copy /Y "dist\DepenDrap_Online.exe" "DepenDrap_Online.exe" >nul
echo 作成しました: %~dp0DepenDrap_Online.exe
pause

