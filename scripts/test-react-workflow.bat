@echo off
echo 🧠 ReAct Workflow Engine Test Suite
echo ====================================

REM Configuration
set WORKFLOW_SERVICE_URL=http://localhost:8004
set TEST_YOUTUBE_URL=https://www.youtube.com/watch?v=dQw4w9WgXcQ

REM Function to check if services are running
:check_services
echo 🔍 Checking if services are running...

REM Check workflow service
curl -s "%WORKFLOW_SERVICE_URL%/health" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Workflow Service is running
) else (
    echo ❌ Workflow Service is not running!
    echo    Please start services with: docker compose up
    pause
    exit /b 1
)

REM Check API Gateway
curl -s "http://localhost:8000/health" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ API Gateway is running
) else (
    echo ⚠️  API Gateway is not running (optional for direct workflow testing)
)

echo.
goto :eof

REM Function to test ReAct YouTube transcription
:test_react_youtube
echo 🎬 Testing ReAct YouTube Transcription Workflow
echo ================================================

echo 📝 Starting ReAct YouTube transcription...

REM Create temporary file for response
set TEMP_FILE=%TEMP%\react_response_%RANDOM%.json

REM Start the workflow
curl -s -X POST "%WORKFLOW_SERVICE_URL%/api/workflow/youtube-transcription-react" ^
    -H "Content-Type: application/json" ^
    -d "{\"youtubeUrl\": \"%TEST_YOUTUBE_URL%\", \"options\": {\"language\": \"en\", \"enhanceText\": false, \"quality\": \"highestaudio\"}}" ^
    -o "%TEMP_FILE%"

REM Check if request was successful
findstr /C:"\"success\":true" "%TEMP_FILE%" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Workflow started successfully!
    
    REM Extract execution ID (simplified extraction)
    for /f "tokens=2 delims=:" %%a in ('findstr /C:"executionId" "%TEMP_FILE%"') do (
        set EXECUTION_ID=%%a
        set EXECUTION_ID=!EXECUTION_ID:"=!
        set EXECUTION_ID=!EXECUTION_ID:,=!
        goto :found_id
    )
    :found_id
    
    echo    Execution ID: %EXECUTION_ID%
    echo.
    
    REM Monitor the workflow for a short time
    echo 🔍 Monitoring workflow for 30 seconds...
    call :monitor_workflow "%EXECUTION_ID%" 6
    
) else (
    echo ❌ Failed to start ReAct workflow
    type "%TEMP_FILE%"
)

REM Cleanup
if exist "%TEMP_FILE%" del "%TEMP_FILE%"
goto :eof

REM Function to test generic ReAct workflow
:test_generic_react
echo 🔧 Testing Generic ReAct Workflow
echo =================================

echo 📝 Starting generic ReAct workflow...

REM Create temporary file for response
set TEMP_FILE=%TEMP%\react_generic_%RANDOM%.json

REM Start the workflow
curl -s -X POST "%WORKFLOW_SERVICE_URL%/api/workflow/react" ^
    -H "Content-Type: application/json" ^
    -d "{\"goal\": \"Analyze and validate a YouTube URL for processing\", \"context\": {\"youtubeUrl\": \"%TEST_YOUTUBE_URL%\", \"language\": \"en\"}, \"metadata\": {\"userId\": \"test-user\", \"source\": \"test-script\", \"priority\": \"normal\", \"tags\": [\"test\", \"demo\", \"react\"]}}" ^
    -o "%TEMP_FILE%"

REM Check if request was successful
findstr /C:"\"success\":true" "%TEMP_FILE%" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Workflow started successfully!
    
    REM Extract execution ID (simplified extraction)
    for /f "tokens=2 delims=:" %%a in ('findstr /C:"executionId" "%TEMP_FILE%"') do (
        set EXECUTION_ID=%%a
        set EXECUTION_ID=!EXECUTION_ID:"=!
        set EXECUTION_ID=!EXECUTION_ID:,=!
        goto :found_generic_id
    )
    :found_generic_id
    
    echo    Execution ID: %EXECUTION_ID%
    echo.
    
    REM Monitor the workflow for a short time
    echo 🔍 Monitoring workflow for 30 seconds...
    call :monitor_workflow "%EXECUTION_ID%" 6
    
) else (
    echo ❌ Failed to start generic ReAct workflow
    type "%TEMP_FILE%"
)

REM Cleanup
if exist "%TEMP_FILE%" del "%TEMP_FILE%"
goto :eof

REM Function to monitor workflow execution
:monitor_workflow
set execution_id=%~1
set max_iterations=%~2
if "%max_iterations%"=="" set max_iterations=6
set iteration=0

:monitor_loop
if %iteration% geq %max_iterations% goto :monitor_timeout

REM Create temporary file for reasoning response
set REASONING_FILE=%TEMP%\reasoning_%RANDOM%.json

REM Get reasoning trace
curl -s "%WORKFLOW_SERVICE_URL%/api/workflow/react/%execution_id%/reasoning" -o "%REASONING_FILE%"

findstr /C:"\"success\":true" "%REASONING_FILE%" >nul 2>&1
if %errorlevel% equ 0 (
    REM Extract status and progress (simplified)
    for /f "tokens=2 delims=:" %%a in ('findstr /C:"\"status\"" "%REASONING_FILE%"') do (
        set STATUS=%%a
        set STATUS=!STATUS:"=!
        set STATUS=!STATUS:,=!
        goto :found_status
    )
    :found_status
    
    echo 📊 Status: %STATUS% ^| Monitoring iteration: %iteration%
    
    REM Check if workflow is complete
    if "%STATUS%"=="completed" (
        echo 🎉 Workflow completed successfully!
        goto :monitor_done
    )
    if "%STATUS%"=="failed" (
        echo ❌ Workflow failed!
        goto :monitor_done
    )
) else (
    echo ❌ Failed to get workflow status
    goto :monitor_done
)

REM Cleanup reasoning file
if exist "%REASONING_FILE%" del "%REASONING_FILE%"

REM Wait 5 seconds
timeout /t 5 /nobreak >nul 2>&1
set /a iteration+=1
goto :monitor_loop

:monitor_timeout
echo ⏰ Monitoring timeout reached

:monitor_done
REM Cleanup reasoning file
if exist "%REASONING_FILE%" del "%REASONING_FILE%"
echo.
goto :eof

REM Function to test all workflow endpoints
:test_all_endpoints
echo 🔗 Testing All ReAct Endpoints
echo =============================

echo 1. Testing health endpoint...
curl -s "%WORKFLOW_SERVICE_URL%/health" | findstr /C:"ok" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Health endpoint working
) else (
    echo ❌ Health endpoint failed
)

echo 2. Testing workflow service info...
curl -s "%WORKFLOW_SERVICE_URL%/" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Workflow service responding
) else (
    echo ⚠️  Workflow service info endpoint not available
)

echo.
goto :eof

REM Main function
:main
echo 🚀 Starting ReAct Workflow Engine Tests
echo.

REM Enable delayed variable expansion
setlocal enabledelayedexpansion

REM Check command line arguments
set test_type=%1
if "%test_type%"=="" set test_type=all

if "%test_type%"=="youtube" (
    call :check_services
    call :test_react_youtube
) else if "%test_type%"=="generic" (
    call :check_services
    call :test_generic_react
) else if "%test_type%"=="endpoints" (
    call :check_services
    call :test_all_endpoints
) else if "%test_type%"=="all" (
    call :check_services
    call :test_all_endpoints
    call :test_react_youtube
    echo.
    call :test_generic_react
) else if "%test_type%"=="help" (
    echo Usage: %0 [youtube^|generic^|endpoints^|all^|help]
    echo.
    echo Options:
    echo   youtube    - Test ReAct YouTube transcription workflow
    echo   generic    - Test generic ReAct workflow
    echo   endpoints  - Test all ReAct endpoints
    echo   all        - Run all tests (default)
    echo   help       - Show this help message
    echo.
    echo Examples:
    echo   %0 youtube     # Test YouTube transcription
    echo   %0 generic     # Test generic workflow
    echo   %0 all         # Run all tests
    goto :end
) else (
    echo ❌ Unknown option: %test_type%
    echo Use '%0 help' for usage information
    pause
    exit /b 1
)

echo.
echo 🎉 ReAct workflow testing completed!
echo.
echo 📚 For more detailed testing, use:
echo    cd services\workflow-service
echo    node test-react.js [youtube^|generic^|both]
echo.
echo 📖 Documentation:
echo    services\workflow-service\README-ReAct.md

:end
echo.
pause
goto :eof

REM Call main function
call :main %*
