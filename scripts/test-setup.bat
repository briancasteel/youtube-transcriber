@echo off
echo 🔍 Testing YouTube Transcriber Setup
echo ==================================

REM Check if Docker is running
echo 1. Checking Docker...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running!
    echo    Please start Docker Desktop and try again.
    echo    Download from: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
) else (
    echo ✅ Docker is running
)

REM Check if docker-compose is available
echo 2. Checking Docker Compose...
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose is not available!
    pause
    exit /b 1
) else (
    echo ✅ Docker Compose is available
)

REM Validate docker-compose.yml
echo 3. Validating docker-compose.yml...
docker compose config >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ docker-compose.yml has errors
    docker compose config
    pause
    exit /b 1
) else (
    echo ✅ docker-compose.yml is valid
)

REM Check if we can build the shared library
echo 4. Testing shared library build...
cd shared
npm install >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Failed to install shared library dependencies
    cd ..
    pause
    exit /b 1
) else (
    echo ✅ Shared library dependencies installed
)

npm run build >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Failed to build shared library
    cd ..
    pause
    exit /b 1
) else (
    echo ✅ Shared library builds successfully
)

cd ..

REM Check if we can build the API Gateway
echo 5. Testing API Gateway build...
cd services\api-gateway
npm install >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Failed to install API Gateway dependencies
    cd ..\..
    pause
    exit /b 1
) else (
    echo ✅ API Gateway dependencies installed
)

npm run build >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Failed to build API Gateway
    cd ..\..
    pause
    exit /b 1
) else (
    echo ✅ API Gateway builds successfully
)

cd ..\..

echo.
echo 🎉 All checks passed! You can now run:
echo    docker compose up --build
echo.
echo 📊 This will start:
echo    - Redis (port 6379)
echo    - API Gateway (port 8000)
echo.
echo 🔗 Test endpoints:
echo    - Health: http://localhost:8000/health
echo    - API Info: http://localhost:8000/
echo.
pause
