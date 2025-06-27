@echo off
echo === YouTube Transcriber Debug Health Check ===
echo Timestamp: %date% %time%
echo.

echo === Workflow Service Health ===
curl -s http://localhost:8004/health >nul 2>&1
if %errorlevel% equ 0 (
    curl -s http://localhost:8004/health
) else (
    echo ❌ Workflow service not responding on port 8004
)

echo.
echo === Agent Status ===
curl -s http://localhost:8004/api/agent/status >nul 2>&1
if %errorlevel% equ 0 (
    curl -s http://localhost:8004/api/agent/status
) else (
    echo ❌ Agent status endpoint not responding
)

echo.
echo === Ollama Health ===
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% equ 0 (
    curl -s http://localhost:11434/api/tags
) else (
    echo ❌ Ollama not responding on port 11434
)

echo.
echo === API Gateway Health ===
curl -s http://localhost:8000/health >nul 2>&1
if %errorlevel% equ 0 (
    curl -s http://localhost:8000/health
) else (
    echo ❌ API Gateway not responding on port 8000
)

echo.
echo === Container Status ===
where docker-compose >nul 2>&1
if %errorlevel% equ 0 (
    docker-compose ps
) else (
    where docker >nul 2>&1
    if %errorlevel% equ 0 (
        docker compose ps
    ) else (
        echo ❌ Docker Compose not available
    )
)

echo.
echo === Port Status ===
echo Checking if ports are listening...
for %%p in (3000 8000 8004 9229 11434) do (
    netstat -an | findstr ":%%p " >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ Port %%p is listening
    ) else (
        echo ❌ Port %%p is not listening
    )
)

echo.
echo === Debug Health Check Complete ===
pause
