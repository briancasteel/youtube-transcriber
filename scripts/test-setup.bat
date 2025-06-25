@echo off
echo [INFO] Testing YouTube Transcriber Setup
echo ====================================

REM Check if Docker is running
echo 1. Checking Docker...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running!
    echo         Please start Docker Desktop and try again.
    echo         Download from: https://www.docker.com/products/docker-desktop/
    goto :end
) else (
    echo [OK] Docker is running
)

REM Check if docker-compose is available
echo 2. Checking Docker Compose...
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker Compose is not available!
    goto :end
) else (
    echo [OK] Docker Compose is available
)

REM Validate docker-compose.yml
echo 3. Validating docker-compose.yml...
docker compose config >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] docker-compose.yml has errors
    docker compose config
    goto :end
) else (
    echo [OK] docker-compose.yml is valid
)

REM Check if Node.js is available (simplified check)
echo 4. Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo         Please install Node.js from: https://nodejs.org/
    goto :end
) else (
    echo [OK] Node.js is available
)

REM Check if npm is available (simplified check)
echo 5. Checking npm...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not available
    goto :end
) else (
    echo [OK] npm is available
)

REM Check if package.json files exist
echo 6. Checking project structure...
if exist "shared\package.json" (
    echo [OK] Shared library package.json found
) else (
    echo [WARN] Shared library package.json not found
)

if exist "services\api-gateway\package.json" (
    echo [OK] API Gateway package.json found
) else (
    echo [WARN] API Gateway package.json not found
)

if exist "services\workflow-service\package.json" (
    echo [OK] Workflow Service package.json found
) else (
    echo [WARN] Workflow Service package.json not found
)

if exist "services\workflow-service\src\services\ReActWorkflowEngine.ts" (
    echo [OK] ReAct Workflow Engine found
) else (
    echo [ERROR] ReAct Workflow Engine not found!
    goto :end
)

echo.
echo [SUCCESS] Basic checks passed! You can now run:
echo           docker compose up --build
echo.
echo [NOTE] For full dependency validation, run:
echo        npm install in each service directory manually
echo.
echo [SERVICES] This will start all services:
echo            - Redis (port 6379)
echo            - API Gateway (port 8000)
echo            - Video Processor (port 8002)
echo            - Transcription Service (port 8003)
echo            - Workflow Service (port 8004) - with ReAct engine!
echo            - LLM Service (port 8005)
echo            - Frontend (port 3000)
echo.
echo [ENDPOINTS] Test endpoints:
echo             - Health: http://localhost:8000/health
echo             - API Info: http://localhost:8000/
echo             - Workflow Health: http://localhost:8004/health
echo.
echo [REACT] ReAct Workflow Testing:
echo         cd services\workflow-service
echo         node test-react.js youtube    # Test ReAct YouTube transcription
echo         node test-react.js generic     # Test generic ReAct workflow
echo         node test-react.js both        # Test both workflows
echo.
echo [DOCS] ReAct Documentation:
echo        services\workflow-service\README-ReAct.md
echo.
echo [QUICK-TEST] Quick ReAct Test (after services are running):
echo              .\scripts\test-react-workflow.bat
echo.

:end
pause
