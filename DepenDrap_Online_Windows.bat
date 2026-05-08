@echo off
setlocal

cd /d "%~dp0"

curl -fsSI http://127.0.0.1:8080/login.html >nul 2>nul
if errorlevel 1 (
  start "DepenDrap Server" /min python serve_secure.py
  timeout /t 2 /nobreak >nul
)

start "" http://127.0.0.1:8080/login.html

