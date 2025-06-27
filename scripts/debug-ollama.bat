@echo off
echo === Ollama Connection Debug Test ===
echo Timestamp: %date% %time%
echo.

echo === 1. Direct Host Connection Test ===
echo Testing Ollama API from host...
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Ollama is responding on localhost:11434
    echo Available models:
    curl -s http://localhost:11434/api/tags
) else (
    echo ❌ Ollama not responding on localhost:11434
    echo Checking if Ollama container is running...
    where docker-compose >nul 2>&1
    if %errorlevel% equ 0 (
        docker-compose ps ollama
    ) else (
        where docker >nul 2>&1
        if %errorlevel% equ 0 (
            docker ps | findstr ollama
        )
    )
)

echo.
echo === 2. Container-to-Container Connection Test ===
echo Testing connection from workflow-service to ollama...
where docker-compose >nul 2>&1
if %errorlevel% equ 0 (
    docker-compose ps workflow-service | findstr "Up" >nul 2>&1
    if %errorlevel% equ 0 (
        echo Workflow service is running, testing connection...
        docker-compose exec -T workflow-service curl -s http://ollama:11434/api/tags >nul 2>&1
        if %errorlevel% equ 0 (
            echo ✅ Container-to-container connection successful
            echo Response from ollama container:
            docker-compose exec -T workflow-service curl -s http://ollama:11434/api/tags
        ) else (
            echo ❌ Container-to-container connection failed
            echo Testing basic network connectivity...
            docker-compose exec -T workflow-service ping -n 3 ollama 2>nul || echo Ping failed
        )
    ) else (
        echo ❌ Workflow service container is not running
    )
) else (
    where docker >nul 2>&1
    if %errorlevel% equ 0 (
        echo Using docker compose...
        docker compose ps workflow-service | findstr "running" >nul 2>&1
        if %errorlevel% equ 0 (
            echo Workflow service is running, testing connection...
            docker compose exec -T workflow-service curl -s http://ollama:11434/api/tags >nul 2>&1
            if %errorlevel% equ 0 (
                echo ✅ Container-to-container connection successful
            ) else (
                echo ❌ Container-to-container connection failed
            )
        ) else (
            echo ❌ Workflow service container is not running
        )
    ) else (
        echo ❌ Docker Compose not available
    )
)

echo.
echo === 3. Ollama Model Check ===
echo Checking available models in Ollama...
where docker-compose >nul 2>&1
if %errorlevel% equ 0 (
    docker-compose ps ollama | findstr "Up" >nul 2>&1
    if %errorlevel% equ 0 (
        echo Ollama container is running, checking models...
        docker-compose exec -T ollama ollama list 2>nul || echo Failed to list models
        
        echo.
        echo Checking if llama2:7b model is available...
        docker-compose exec -T ollama ollama list | findstr "llama2:7b" >nul 2>&1
        if %errorlevel% equ 0 (
            echo ✅ llama2:7b model is available
        ) else (
            echo ❌ llama2:7b model not found
            echo Attempting to pull llama2:7b model...
            docker-compose exec -T ollama ollama pull llama2:7b
        )
    ) else (
        echo ❌ Ollama container is not running
    )
) else (
    echo ❌ Docker Compose not available for model check
)

echo.
echo === 4. Network Configuration Check ===
echo Checking Docker network configuration...
where docker >nul 2>&1
if %errorlevel% equ 0 (
    echo Available networks:
    docker network ls | findstr /C:"youtube" /C:"transcriber" /C:"bridge"
    
    echo.
    echo Checking youtube-transcriber network:
    docker network inspect youtube-transcriber >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ youtube-transcriber network exists
        echo Connected containers:
        docker network inspect youtube-transcriber
    ) else (
        echo ❌ youtube-transcriber network not found
    )
)

echo.
echo === 5. Ollama Service Logs ===
echo Recent Ollama logs (last 20 lines):
where docker-compose >nul 2>&1
if %errorlevel% equ 0 (
    docker-compose logs --tail=20 ollama 2>nul || echo Cannot retrieve Ollama logs
) else (
    where docker >nul 2>&1
    if %errorlevel% equ 0 (
        docker compose logs --tail=20 ollama 2>nul || echo Cannot retrieve Ollama logs
    ) else (
        echo ❌ Cannot retrieve logs - Docker Compose not available
    )
)

echo.
echo === 6. Environment Variables Check ===
echo Checking workflow service environment variables...
where docker-compose >nul 2>&1
if %errorlevel% equ 0 (
    docker-compose ps workflow-service | findstr "Up" >nul 2>&1
    if %errorlevel% equ 0 (
        echo OLLAMA_URL:
        docker-compose exec -T workflow-service cmd /c "echo %OLLAMA_URL%" 2>nul || echo OLLAMA_URL not set
        echo OLLAMA_DEFAULT_MODEL:
        docker-compose exec -T workflow-service cmd /c "echo %OLLAMA_DEFAULT_MODEL%" 2>nul || echo OLLAMA_DEFAULT_MODEL not set
    ) else (
        echo ❌ Workflow service not running
    )
)

echo.
echo === Ollama Debug Test Complete ===
echo.
echo === Troubleshooting Tips ===
echo If connections are failing:
echo 1. Ensure all containers are running: docker-compose ps
echo 2. Check container logs: docker-compose logs ollama
echo 3. Restart services: docker-compose restart ollama workflow-service
echo 4. Rebuild containers: docker-compose up --build
echo 5. Check firewall/antivirus blocking ports 11434 or 8004
echo.
pause
