@echo off
REM 启动服务器
cd server
start /B server.exe

REM 等待 1 秒确保服务已启动
timeout /t 2 >nul

REM 打开默认浏览器访问 localhost
start http://localhost:2460