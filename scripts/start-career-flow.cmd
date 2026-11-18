@echo off
rem Career Flow 실행: 필요하면 빌드한 뒤 서버를 켜고 브라우저를 연다.
chcp 65001 >nul
cd /d "%~dp0.."
if not exist ".next\BUILD_ID" (
  echo 처음 실행이라 빌드합니다. 잠시 기다려 주세요...
  call npm run build
  if errorlevel 1 (
    echo 빌드에 실패했습니다.
    pause
    exit /b 1
  )
)
rem 서버가 뜰 시간을 조금 준 뒤 브라우저를 연다.
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://127.0.0.1:3939"
call npm run start
pause
