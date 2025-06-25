#!/bin/bash

echo "🧠 ReAct Workflow Engine Test Suite"
echo "===================================="

# Configuration
WORKFLOW_SERVICE_URL="http://localhost:8004"
TEST_YOUTUBE_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if services are running
check_services() {
    echo "🔍 Checking if services are running..."
    
    # Check workflow service
    if curl -s "$WORKFLOW_SERVICE_URL/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Workflow Service is running${NC}"
    else
        echo -e "${RED}❌ Workflow Service is not running!${NC}"
        echo "   Please start services with: docker compose up"
        exit 1
    fi
    
    # Check API Gateway
    if curl -s "http://localhost:8000/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API Gateway is running${NC}"
    else
        echo -e "${YELLOW}⚠️  API Gateway is not running (optional for direct workflow testing)${NC}"
    fi
    
    echo ""
}

# Function to test ReAct YouTube transcription
test_react_youtube() {
    echo -e "${BLUE}🎬 Testing ReAct YouTube Transcription Workflow${NC}"
    echo "================================================"
    
    echo "📝 Starting ReAct YouTube transcription..."
    
    # Start the workflow
    RESPONSE=$(curl -s -X POST "$WORKFLOW_SERVICE_URL/api/workflow/youtube-transcription-react" \
        -H "Content-Type: application/json" \
        -d "{
            \"youtubeUrl\": \"$TEST_YOUTUBE_URL\",
            \"options\": {
                \"language\": \"en\",
                \"enhanceText\": false,
                \"quality\": \"highestaudio\"
            }
        }")
    
    # Check if request was successful
    if echo "$RESPONSE" | grep -q '"success":true'; then
        EXECUTION_ID=$(echo "$RESPONSE" | grep -o '"executionId":"[^"]*"' | cut -d'"' -f4)
        GOAL=$(echo "$RESPONSE" | grep -o '"goal":"[^"]*"' | cut -d'"' -f4)
        
        echo -e "${GREEN}✅ Workflow started successfully!${NC}"
        echo "   Execution ID: $EXECUTION_ID"
        echo "   Goal: $GOAL"
        echo ""
        
        # Monitor the workflow for a short time
        echo "🔍 Monitoring workflow for 30 seconds..."
        monitor_workflow "$EXECUTION_ID" 6 # 6 iterations of 5 seconds each
        
    else
        echo -e "${RED}❌ Failed to start ReAct workflow${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
}

# Function to test generic ReAct workflow
test_generic_react() {
    echo -e "${BLUE}🔧 Testing Generic ReAct Workflow${NC}"
    echo "================================="
    
    echo "📝 Starting generic ReAct workflow..."
    
    # Start the workflow
    RESPONSE=$(curl -s -X POST "$WORKFLOW_SERVICE_URL/api/workflow/react" \
        -H "Content-Type: application/json" \
        -d "{
            \"goal\": \"Analyze and validate a YouTube URL for processing\",
            \"context\": {
                \"youtubeUrl\": \"$TEST_YOUTUBE_URL\",
                \"language\": \"en\"
            },
            \"metadata\": {
                \"userId\": \"test-user\",
                \"source\": \"test-script\",
                \"priority\": \"normal\",
                \"tags\": [\"test\", \"demo\", \"react\"]
            }
        }")
    
    # Check if request was successful
    if echo "$RESPONSE" | grep -q '"success":true'; then
        EXECUTION_ID=$(echo "$RESPONSE" | grep -o '"executionId":"[^"]*"' | cut -d'"' -f4)
        GOAL=$(echo "$RESPONSE" | grep -o '"goal":"[^"]*"' | cut -d'"' -f4)
        
        echo -e "${GREEN}✅ Workflow started successfully!${NC}"
        echo "   Execution ID: $EXECUTION_ID"
        echo "   Goal: $GOAL"
        echo ""
        
        # Monitor the workflow for a short time
        echo "🔍 Monitoring workflow for 30 seconds..."
        monitor_workflow "$EXECUTION_ID" 6 # 6 iterations of 5 seconds each
        
    else
        echo -e "${RED}❌ Failed to start generic ReAct workflow${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
}

# Function to monitor workflow execution
monitor_workflow() {
    local execution_id=$1
    local max_iterations=${2:-6}
    local iteration=0
    
    while [ $iteration -lt $max_iterations ]; do
        # Get reasoning trace
        REASONING_RESPONSE=$(curl -s "$WORKFLOW_SERVICE_URL/api/workflow/react/$execution_id/reasoning")
        
        if echo "$REASONING_RESPONSE" | grep -q '"success":true'; then
            STATUS=$(echo "$REASONING_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            REASONING_STEPS=$(echo "$REASONING_RESPONSE" | grep -o '"reasoningSteps":[0-9]*' | cut -d':' -f2)
            ACTIONS_EXECUTED=$(echo "$REASONING_RESPONSE" | grep -o '"actionsExecuted":[0-9]*' | cut -d':' -f2)
            SUCCESSFUL_ACTIONS=$(echo "$REASONING_RESPONSE" | grep -o '"successfulActions":[0-9]*' | cut -d':' -f2)
            
            echo "📊 Status: $STATUS | Reasoning Steps: $REASONING_STEPS | Actions: $ACTIONS_EXECUTED | Successful: $SUCCESSFUL_ACTIONS"
            
            # Check if workflow is complete
            if [ "$STATUS" = "completed" ]; then
                echo -e "${GREEN}🎉 Workflow completed successfully!${NC}"
                
                # Get final execution status
                EXECUTION_RESPONSE=$(curl -s "$WORKFLOW_SERVICE_URL/api/workflow/execution/$execution_id")
                if echo "$EXECUTION_RESPONSE" | grep -q '"success":true'; then
                    DURATION=$(echo "$EXECUTION_RESPONSE" | grep -o '"duration":[0-9]*' | cut -d':' -f2)
                    echo "   Duration: ${DURATION}ms"
                fi
                break
            elif [ "$STATUS" = "failed" ]; then
                echo -e "${RED}❌ Workflow failed!${NC}"
                break
            fi
        else
            echo -e "${RED}❌ Failed to get workflow status${NC}"
            break
        fi
        
        sleep 5
        iteration=$((iteration + 1))
    done
    
    if [ $iteration -ge $max_iterations ]; then
        echo -e "${YELLOW}⏰ Monitoring timeout reached${NC}"
    fi
    
    echo ""
}

# Function to show reasoning trace
show_reasoning_trace() {
    local execution_id=$1
    
    echo -e "${BLUE}🧠 Detailed Reasoning Trace${NC}"
    echo "=========================="
    
    REASONING_RESPONSE=$(curl -s "$WORKFLOW_SERVICE_URL/api/workflow/react/$execution_id/reasoning")
    
    if echo "$REASONING_RESPONSE" | grep -q '"success":true'; then
        echo "$REASONING_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$REASONING_RESPONSE"
    else
        echo -e "${RED}❌ Failed to get reasoning trace${NC}"
    fi
}

# Function to test all workflow endpoints
test_all_endpoints() {
    echo -e "${BLUE}🔗 Testing All ReAct Endpoints${NC}"
    echo "============================="
    
    # Test health endpoint
    echo "1. Testing health endpoint..."
    if curl -s "$WORKFLOW_SERVICE_URL/health" | grep -q "ok"; then
        echo -e "${GREEN}✅ Health endpoint working${NC}"
    else
        echo -e "${RED}❌ Health endpoint failed${NC}"
    fi
    
    # Test workflow info (if available)
    echo "2. Testing workflow service info..."
    curl -s "$WORKFLOW_SERVICE_URL/" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Workflow service responding${NC}"
    else
        echo -e "${YELLOW}⚠️  Workflow service info endpoint not available${NC}"
    fi
    
    echo ""
}

# Main function
main() {
    echo "🚀 Starting ReAct Workflow Engine Tests"
    echo ""
    
    # Check command line arguments
    case "${1:-all}" in
        "youtube")
            check_services
            test_react_youtube
            ;;
        "generic")
            check_services
            test_generic_react
            ;;
        "endpoints")
            check_services
            test_all_endpoints
            ;;
        "all")
            check_services
            test_all_endpoints
            test_react_youtube
            echo ""
            test_generic_react
            ;;
        "help"|"-h"|"--help")
            echo "Usage: $0 [youtube|generic|endpoints|all|help]"
            echo ""
            echo "Options:"
            echo "  youtube    - Test ReAct YouTube transcription workflow"
            echo "  generic    - Test generic ReAct workflow"
            echo "  endpoints  - Test all ReAct endpoints"
            echo "  all        - Run all tests (default)"
            echo "  help       - Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 youtube     # Test YouTube transcription"
            echo "  $0 generic     # Test generic workflow"
            echo "  $0 all         # Run all tests"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
    
    echo ""
    echo -e "${GREEN}🎉 ReAct workflow testing completed!${NC}"
    echo ""
    echo "📚 For more detailed testing, use:"
    echo "   cd services/workflow-service"
    echo "   node test-react.js [youtube|generic|both]"
    echo ""
    echo "📖 Documentation:"
    echo "   services/workflow-service/README-ReAct.md"
}

# Run main function with all arguments
main "$@"
