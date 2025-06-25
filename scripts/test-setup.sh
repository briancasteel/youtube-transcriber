#!/bin/bash

echo "🔍 Testing YouTube Transcriber Setup"
echo "=================================="

# Check if Docker is running
echo "1. Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running!"
    echo "   Please start Docker Desktop and try again."
    echo "   Download from: https://www.docker.com/products/docker-desktop/"
    exit 1
else
    echo "✅ Docker is running"
fi

# Check if docker-compose is available
echo "2. Checking Docker Compose..."
if ! docker compose version > /dev/null 2>&1; then
    echo "❌ Docker Compose is not available!"
    exit 1
else
    echo "✅ Docker Compose is available"
fi

# Validate docker-compose.yml
echo "3. Validating docker-compose.yml..."
if docker compose config > /dev/null 2>&1; then
    echo "✅ docker-compose.yml is valid"
else
    echo "❌ docker-compose.yml has errors"
    docker compose config
    exit 1
fi

# Check if we can build the shared library
echo "4. Testing shared library build..."
cd shared
if npm install > /dev/null 2>&1; then
    echo "✅ Shared library dependencies installed"
else
    echo "❌ Failed to install shared library dependencies"
    exit 1
fi

if npm run build > /dev/null 2>&1; then
    echo "✅ Shared library builds successfully"
else
    echo "❌ Failed to build shared library"
    exit 1
fi

cd ..

# Check if we can build the API Gateway
echo "5. Testing API Gateway build..."
cd services/api-gateway
if npm install > /dev/null 2>&1; then
    echo "✅ API Gateway dependencies installed"
else
    echo "❌ Failed to install API Gateway dependencies"
    exit 1
fi

if npm run build > /dev/null 2>&1; then
    echo "✅ API Gateway builds successfully"
else
    echo "❌ Failed to build API Gateway"
    exit 1
fi

cd ../..

# Check if we can build the Workflow Service (ReAct engine)
echo "6. Testing Workflow Service build..."
cd services/workflow-service
if npm install > /dev/null 2>&1; then
    echo "✅ Workflow Service dependencies installed"
else
    echo "❌ Failed to install Workflow Service dependencies"
    exit 1
fi

if npm run build > /dev/null 2>&1; then
    echo "✅ Workflow Service builds successfully"
else
    echo "❌ Failed to build Workflow Service"
    exit 1
fi

cd ../..

echo ""
echo "🎉 All checks passed! You can now run:"
echo "   docker compose up --build"
echo ""
echo "📊 This will start all services:"
echo "   - Redis (port 6379)"
echo "   - API Gateway (port 8000)"
echo "   - Video Processor (port 8002)"
echo "   - Transcription Service (port 8003)"
echo "   - Workflow Service (port 8004) - with ReAct engine!"
echo "   - LLM Service (port 8005)"
echo "   - Frontend (port 3000)"
echo ""
echo "🔗 Test endpoints:"
echo "   - Health: http://localhost:8000/health"
echo "   - API Info: http://localhost:8000/"
echo "   - Workflow Health: http://localhost:8004/health"
echo ""
echo "🧠 ReAct Workflow Testing:"
echo "   cd services/workflow-service"
echo "   node test-react.js youtube    # Test ReAct YouTube transcription"
echo "   node test-react.js generic     # Test generic ReAct workflow"
echo "   node test-react.js both        # Test both workflows"
echo ""
echo "📚 ReAct Documentation:"
echo "   services/workflow-service/README-ReAct.md"
echo ""
echo "🚀 Quick ReAct Test (after services are running):"
echo "   ./scripts/test-react-workflow.sh"
