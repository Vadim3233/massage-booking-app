@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "SERVER_SCRIPT=server\openProjectServer.mjs"
set "APP_URL=http://127.0.0.1:5173/"

cd /d "%PROJECT_DIR%"

if not exist "%NODE_EXE%" (
  echo Could not find the bundled Node runtime:
  echo %NODE_EXE%
  echo.
  echo Open the project in Codex again and ask to run it, or reinstall workspace dependencies.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo Could not find the built app:
  echo %PROJECT_DIR%dist\index.html
  echo.
  echo Open the project in Codex and ask it to build the project.
  pause
  exit /b 1
)

if not exist "%SERVER_SCRIPT%" (
  echo Could not find the project opener:
  echo %PROJECT_DIR%%SERVER_SCRIPT%
  echo.
  echo Open the project in Codex and ask it to recreate the opener.
  pause
  exit /b 1
)

echo Starting Chain Scheduler...
echo.
echo The app will open at %APP_URL%
echo Leave this window open while using the project.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process '%APP_URL%'"
"%NODE_EXE%" "%SERVER_SCRIPT%"

echo.
echo Server stopped.
pause
