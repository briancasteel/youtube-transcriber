#!/bin/bash

echo "=== Ollama Connection Debug Test ==="
echo "Timestamp: $(date)"
echo ""

echo "=== 1. Direct Host Connection Test ==="
echo "Testing Ollama API from host..."
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama is responding on localhost:11434"
    echo "Available models:"
    curl -s http://localhost:11434/api/tags | jq '.models[]?.name // "No models found"' 2>/dev/null || curl -s http://localhost:11434/api/tags
else
    echo "❌ Ollama not responding on localhost:11434"
    echo "Checking if Ollama container is running..."
    if command -v docker-compose > /dev/null 2>&1; then
        docker-compose ps ollama
    elif command -v docker > /dev/null 2>&1; then
        docker ps | grep ollama
    fi
fi

echo ""
echo "=== 2. Container-to-Container Connection Test ==="
echo "Testing connection from workflow-service to ollama..."
if command -v docker-compose > /dev/null 2>&1; then
    if docker-compose ps workflow-service | grep -q "Up"; then
        echo "Workflow service is running, testing connection..."
        docker-compose exec -T workflow-service curl -s http://ollama:11434/api/tags > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo "✅ Container-to-container connection successful"
            echo "Response from ollama container:"
            docker-compose exec -T workflow-service curl -s http://ollama:11434/api/tags
        else
            echo "❌ Container-to-container connection failed"
            echo "Testing basic network connectivity..."
            docker-compose exec -T workflow-service ping -c 3 ollama 2>/dev/null || echo "Ping failed"
        fi
    else
        echo "❌ Workflow service container is not running"
    fi
elif command -v docker > /dev/null 2>&1; then
    echo "Using docker compose..."
    if docker compose ps workflow-service | grep -q "running"; then
        echo "Workflow service is running, testing connection..."
        docker compose exec -T workflow-service curl -s http://ollama:11434/api/tags > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo "✅ Container-to-container connection successful"
        else
            echo "❌ Container-to-container connection failed"
        fi
    else
        echo "❌ Workflow service container is not running"
    fi
else
    echo "❌ Docker Compose not available"
fi

echo ""
echo "=== 3. Ollama Model Check ==="
echo "Checking available models in Ollama..."
if command -v docker-compose > /dev/null 2>&1; then
    if docker-compose ps ollama | grep -q "Up"; then
        echo "Ollama container is running, checking models..."
        docker-compose exec -T ollama ollama list 2>/dev/null || echo "Failed to list models"
        
        echo ""
        echo "Checking if llama2:7b model is available..."
        if docker-compose exec -T ollama ollama list | grep -q "llama2:7b"; then
            echo "✅ llama2:7b model is available"
        else
            echo "❌ llama2:7b model not found"
            echo "Attempting to pull llama2:7b model..."
            docker-compose exec -T ollama ollama pull llama2:7b
        fi
    else
        echo "❌ Ollama container is not running"
    fi
else
    echo "❌ Docker Compose not available for model check"
fi

echo ""
echo "=== 4. Network Configuration Check ==="
echo "Checking Docker network configuration..."
if command -v docker > /dev/null 2>&1; then
    echo "Available networks:"
    docker network ls | grep -E "(youtube|transcriber|bridge)"
    
    echo ""
    echo "Checking youtube-transcriber network:"
    if docker network inspect youtube-transcriber > /dev/null 2>&1; then
        echo "✅ youtube-transcriber network exists"
        echo "Connected containers:"
        docker network inspect youtube-transcriber | jq '.[] | .Containers | keys[]' 2>/dev/null || echo "Cannot parse network info"
    else
        echo "❌ youtube-transcriber network not found"
    fi
fi

echo ""
echo "=== 5. Ollama Service Logs ==="
echo "Recent Ollama logs (last 20 lines):"
if command -v docker-compose > /dev/null 2>&1; then
    docker-compose logs --tail=20 ollama 2>/dev/null || echo "Cannot retrieve Ollama logs"
elif command -v docker > /dev/null 2>&1; then
    docker compose logs --tail=20 ollama 2>/dev/null || echo "Cannot retrieve Ollama logs"
else
    echo "❌ Cannot retrieve logs - Docker Compose not available"
fi

echo ""
echo "=== 6. Environment Variables Check ==="
echo "Checking workflow service environment variables..."
if command -v docker-compose > /dev/null 2>&1; then
    if docker-compose ps workflow-service | grep -q "Up"; then
        echo "OLLAMA_URL:"
        docker-compose exec -T workflow-service env | grep OLLAMA_URL || echo "OLLAMA_URL not set"
        echo "OLLAMA_DEFAULT_MODEL:"
        docker-compose exec -T workflow-service env | grep OLLAMA_DEFAULT_MODEL || echo "OLLAMA_DEFAULT_MODEL not set"
    else
        echo "❌ Workflow service not running"
    fi
fi

echo ""
echo "=== Ollama Debug Test Complete ==="
echo ""
echo "=== Troubleshooting Tips ==="
echo "If connections are failing:"
echo "1. Ensure all containers are running: docker-compose ps"
echo "2. Check container logs: docker-compose logs ollama"
echo "3. Restart services: docker-compose restart ollama workflow-service"
echo "4. Rebuild containers: docker-compose up --build"
echo "5. Check firewall/antivirus blocking ports 11434 or 8004"
