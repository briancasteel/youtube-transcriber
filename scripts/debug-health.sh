#!/bin/bash

echo "=== YouTube Transcriber Debug Health Check ==="
echo "Timestamp: $(date)"
echo ""

echo "=== Workflow Service Health ==="
if curl -s http://localhost:8004/health > /dev/null 2>&1; then
    curl -s http://localhost:8004/health | jq . 2>/dev/null || curl -s http://localhost:8004/health
else
    echo "❌ Workflow service not responding on port 8004"
fi

echo ""
echo "=== Agent Status ==="
if curl -s http://localhost:8004/api/agent/status > /dev/null 2>&1; then
    curl -s http://localhost:8004/api/agent/status | jq . 2>/dev/null || curl -s http://localhost:8004/api/agent/status
else
    echo "❌ Agent status endpoint not responding"
fi

echo ""
echo "=== Ollama Health ==="
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    curl -s http://localhost:11434/api/tags | jq . 2>/dev/null || curl -s http://localhost:11434/api/tags
else
    echo "❌ Ollama not responding on port 11434"
fi

echo ""
echo "=== API Gateway Health ==="
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    curl -s http://localhost:8000/health | jq . 2>/dev/null || curl -s http://localhost:8000/health
else
    echo "❌ API Gateway not responding on port 8000"
fi

echo ""
echo "=== Container Status ==="
if command -v docker-compose > /dev/null 2>&1; then
    docker-compose ps
elif command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
    docker compose ps
else
    echo "❌ Docker Compose not available"
fi

echo ""
echo "=== Port Status ==="
echo "Checking if ports are listening..."
for port in 3000 8000 8004 9229 11434; do
    if command -v netstat > /dev/null 2>&1; then
        if netstat -an | grep ":$port " > /dev/null 2>&1; then
            echo "✅ Port $port is listening"
        else
            echo "❌ Port $port is not listening"
        fi
    elif command -v ss > /dev/null 2>&1; then
        if ss -an | grep ":$port " > /dev/null 2>&1; then
            echo "✅ Port $port is listening"
        else
            echo "❌ Port $port is not listening"
        fi
    else
        echo "⚠️  Cannot check port $port (no netstat or ss available)"
    fi
done

echo ""
echo "=== Debug Health Check Complete ==="
