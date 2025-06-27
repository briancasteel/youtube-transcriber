# Debugging Guide for YouTube Transcriber

## Workflow Container Debugging

The workflow container has been configured with comprehensive debugging capabilities to help troubleshoot Ollama connection issues and other problems.

## Debug Configuration

### Enabled Debug Features

1. **Node.js Inspector**: Port 9229 exposed for debugging
2. **Enhanced Logging**: `LOG_LEVEL=debug` and `DEBUG=*` enabled
3. **Volume Mounts**: Source code and dist folders mounted for live debugging
4. **Development Dependencies**: Kept in container for debugging tools

### Environment Variables

```yaml
environment:
  - NODE_ENV=development
  - LOG_LEVEL=debug
  - DEBUG=*
  - NODE_OPTIONS=--inspect=0.0.0.0:9229
  - OLLAMA_URL=http://ollama:11434
  - OLLAMA_DEFAULT_MODEL=llama2:7b
```

### Exposed Ports

- **8004**: Application port
- **9229**: Node.js debug port

## Debugging Methods

### 1. Container Logs

View real-time logs from the workflow service:

```bash
# View workflow service logs
docker-compose logs -f workflow-service

# View all service logs
docker-compose logs -f

# View logs with timestamps
docker-compose logs -f --timestamps workflow-service
```

### 2. Node.js Inspector Debugging

Connect to the Node.js debugger:

1. **Chrome DevTools**:
   - Open Chrome and go to `chrome://inspect`
   - Click "Configure" and add `localhost:9229`
   - Click "inspect" on the Node.js target

2. **VS Code Debugging**:
   - Create `.vscode/launch.json`:
   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "name": "Attach to Docker",
         "type": "node",
         "request": "attach",
         "port": 9229,
         "address": "localhost",
         "localRoot": "${workspaceFolder}/services/workflow-service",
         "remoteRoot": "/app",
         "protocol": "inspector"
       }
     ]
   }
   ```

### 3. Interactive Container Access

Access the running container for debugging:

```bash
# Get container ID
docker ps | grep workflow-service

# Access container shell
docker exec -it <container-id> sh

# Or use docker-compose
docker-compose exec workflow-service sh
```

### 4. Health Check Debugging

Test the health endpoints:

```bash
# Test workflow service health
curl http://localhost:8004/health

# Test agent status
curl http://localhost:8004/api/agent/status

# Test Ollama connectivity from host
curl http://localhost:11434/api/tags

# Test Ollama connectivity from container
docker-compose exec workflow-service curl http://ollama:11434/api/tags
```

## Debugging Ollama Connection Issues

### Step 1: Verify Ollama Service

```bash
# Check if Ollama is running
docker-compose ps ollama

# Check Ollama logs
docker-compose logs ollama

# Test Ollama API
curl http://localhost:11434/api/tags
```

### Step 2: Test Network Connectivity

```bash
# From workflow container to Ollama
docker-compose exec workflow-service curl http://ollama:11434/api/tags

# Check network configuration
docker network ls
docker network inspect youtube-transcriber_default
```

### Step 3: Check Environment Variables

```bash
# Verify environment variables in container
docker-compose exec workflow-service env | grep OLLAMA
```

### Step 4: Test Agent Initialization

```bash
# Check agent status
curl -v http://localhost:8004/api/agent/status

# Test simple transcription
curl -X POST http://localhost:8004/api/transcribe \
  -H "Content-Type: application/json" \
  -d '{"videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## Common Debug Scenarios

### 1. Ollama Connection Timeout

**Symptoms**: Agent reports Ollama unavailable
**Debug Steps**:
```bash
# Check Ollama startup
docker-compose logs ollama | grep "Ollama server"

# Test direct connection
docker-compose exec workflow-service curl -v http://ollama:11434/api/tags

# Check if model is available
docker-compose exec ollama ollama list
```

### 2. Agent Initialization Failure

**Symptoms**: Agent status shows unavailable
**Debug Steps**:
```bash
# Check agent logs during startup
docker-compose logs workflow-service | grep -i "agent\|ollama\|error"

# Test ChatOllama directly
docker-compose exec workflow-service node -e "
const { ChatOllama } = require('@langchain/ollama');
const chat = new ChatOllama({ 
  model: 'llama2:7b', 
  baseUrl: 'http://ollama:11434' 
});
console.log('ChatOllama created successfully');
"
```

### 3. Tool Execution Issues

**Symptoms**: Tools fail to execute
**Debug Steps**:
```bash
# Enable tool-specific debugging
docker-compose exec workflow-service node -e "
process.env.DEBUG = '*tool*';
// Test tool execution
"

# Check tool logs
docker-compose logs workflow-service | grep -i "tool"
```

## Advanced Debugging

### 1. Memory and Performance

```bash
# Check container resource usage
docker stats workflow-service

# Check memory usage inside container
docker-compose exec workflow-service cat /proc/meminfo

# Check Node.js memory usage
docker-compose exec workflow-service node -e "console.log(process.memoryUsage())"
```

### 2. Network Debugging

```bash
# Check container networking
docker-compose exec workflow-service netstat -tlnp

# Test DNS resolution
docker-compose exec workflow-service nslookup ollama

# Check routing
docker-compose exec workflow-service route -n
```

### 3. File System Debugging

```bash
# Check mounted volumes
docker-compose exec workflow-service ls -la /app/

# Check source code mounting
docker-compose exec workflow-service ls -la /app/src/

# Check build output
docker-compose exec workflow-service ls -la /app/dist/
```

## Debug Scripts

### Quick Health Check Script

Create `debug-health.sh`:
```bash
#!/bin/bash
echo "=== Workflow Service Health ==="
curl -s http://localhost:8004/health | jq .

echo -e "\n=== Agent Status ==="
curl -s http://localhost:8004/api/agent/status | jq .

echo -e "\n=== Ollama Health ==="
curl -s http://localhost:11434/api/tags | jq .

echo -e "\n=== Container Status ==="
docker-compose ps
```

### Ollama Connection Test Script

Create `debug-ollama.sh`:
```bash
#!/bin/bash
echo "=== Testing Ollama Connection ==="

echo "1. Direct host connection:"
curl -s http://localhost:11434/api/tags

echo -e "\n2. Container to container connection:"
docker-compose exec workflow-service curl -s http://ollama:11434/api/tags

echo -e "\n3. Available models:"
docker-compose exec ollama ollama list

echo -e "\n4. Ollama logs (last 20 lines):"
docker-compose logs --tail=20 ollama
```

## Troubleshooting Tips

1. **Always check logs first**: `docker-compose logs -f workflow-service`
2. **Verify network connectivity**: Test container-to-container communication
3. **Check environment variables**: Ensure all required vars are set
4. **Test incrementally**: Start with simple health checks, then complex operations
5. **Use the debugger**: Attach VS Code or Chrome DevTools for step-by-step debugging
6. **Monitor resources**: Check memory and CPU usage during debugging

## Production Debugging

For production environments, modify the docker-compose.yml:

```yaml
# Remove debug configurations for production
environment:
  - NODE_ENV=production
  - LOG_LEVEL=info
  # Remove DEBUG=* and NODE_OPTIONS
ports:
  - "8004:8004"
  # Remove debug port 9229
```

And uncomment the production lines in Dockerfile:
```dockerfile
# Uncomment for production
RUN npm prune --production && rm -rf src/ tsconfig.json
```

This debugging setup provides comprehensive visibility into the workflow container's operation and should help identify and resolve Ollama connection issues.
