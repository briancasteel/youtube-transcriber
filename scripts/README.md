# Scripts Directory

This directory contains various scripts to help with testing and setup of the YouTube Transcriber project, including the new ReAct (Reasoning + Acting) workflow engine.

## Setup Scripts

### `test-setup.sh` / `test-setup.bat`
**Purpose**: Validate the project setup and ensure all components can be built successfully.

**What it checks**:
- Docker and Docker Compose availability
- docker-compose.yml validation
- Shared library build
- API Gateway build
- Workflow Service build (including ReAct engine)

**Usage**:
```bash
# Linux/macOS
./scripts/test-setup.sh

# Windows
.\scripts\test-setup.bat
```

**Output**: Provides information about all services and their ports, plus ReAct testing instructions.

## ReAct Workflow Testing Scripts

### `test-react-workflow.sh` / `test-react-workflow.bat`
**Purpose**: Test the new ReAct (Reasoning + Acting) workflow engine with various scenarios.

**Features**:
- Service health checks
- ReAct YouTube transcription testing
- Generic ReAct workflow testing
- Real-time workflow monitoring
- Endpoint validation

**Usage**:
```bash
# Linux/macOS
./scripts/test-react-workflow.sh [option]

# Windows
.\scripts\test-react-workflow.bat [option]
```

**Options**:
- `youtube` - Test ReAct YouTube transcription workflow
- `generic` - Test generic ReAct workflow
- `endpoints` - Test all ReAct endpoints
- `all` - Run all tests (default)
- `help` - Show help message

**Examples**:
```bash
# Test YouTube transcription with ReAct
./scripts/test-react-workflow.sh youtube

# Test generic ReAct workflow
./scripts/test-react-workflow.sh generic

# Run all ReAct tests
./scripts/test-react-workflow.sh all
```

## Advanced Testing

### Node.js Test Script
For more detailed ReAct testing with real-time reasoning trace monitoring:

```bash
cd services/workflow-service
node test-react.js [youtube|generic|both]
```

This provides:
- Real-time reasoning step monitoring
- Detailed action execution tracking
- Complete observation analysis
- Progress metrics and success rates

## Service Ports

When all services are running via `docker compose up`, the following ports are available:

| Service | Port | Purpose |
|---------|------|---------|
| Redis | 6379 | Data storage |
| API Gateway | 8000 | Main API entry point |
| Video Processor | 8002 | Video processing and audio extraction |
| Transcription Service | 8003 | Audio transcription |
| **Workflow Service** | **8004** | **ReAct workflow engine** |
| LLM Service | 8005 | Text enhancement and AI processing |
| Frontend | 3000 | Web interface |

## ReAct Workflow Engine

The new ReAct (Reasoning + Acting) pattern provides:

### **Key Features**
- **Explicit Reasoning**: Every decision logged with detailed reasoning
- **Intelligent Decision Making**: Context-aware action planning
- **Advanced Error Handling**: Intelligent error recovery with alternatives
- **Complete Transparency**: Full reasoning trace accessible via API

### **API Endpoints**
- `POST /api/workflow/react` - Generic goal-oriented workflow
- `POST /api/workflow/youtube-transcription-react` - YouTube transcription with ReAct
- `GET /api/workflow/react/{executionId}/reasoning` - Real-time reasoning trace

### **Example Usage**
```bash
# Start ReAct YouTube transcription
curl -X POST http://localhost:8004/api/workflow/youtube-transcription-react \
  -H "Content-Type: application/json" \
  -d '{
    "youtubeUrl": "https://youtube.com/watch?v=example",
    "options": {
      "language": "en",
      "enhanceText": true
    }
  }'

# Monitor reasoning process
curl http://localhost:8004/api/workflow/react/{executionId}/reasoning
```

## Prerequisites

### Required Software
- **Docker Desktop**: For containerized services
- **Node.js**: For running test scripts and building services
- **curl**: For API testing (usually pre-installed)

### For Windows Users
- **Git Bash** or **WSL**: Recommended for running shell scripts
- **PowerShell**: Alternative for running batch scripts

## Quick Start

1. **Setup and Validation**:
   ```bash
   # Validate setup
   ./scripts/test-setup.sh
   
   # Start all services
   docker compose up --build
   ```

2. **Test ReAct Workflows**:
   ```bash
   # Quick ReAct test
   ./scripts/test-react-workflow.sh
   
   # Detailed ReAct testing
   cd services/workflow-service
   node test-react.js youtube
   ```

3. **Monitor ReAct Reasoning**:
   - Use the reasoning trace endpoint to see the system's thought process
   - Watch real-time decision making and action execution
   - Analyze confidence levels and alternative approaches

## Troubleshooting

### Common Issues

**Docker not running**:
- Start Docker Desktop
- Verify with `docker info`

**Services not responding**:
- Check `docker compose logs [service-name]`
- Ensure all ports are available
- Restart with `docker compose down && docker compose up`

**ReAct workflow failures**:
- Check workflow service logs: `docker compose logs workflow-service`
- Verify service connectivity between containers
- Use reasoning trace endpoint for debugging

### Getting Help

- **ReAct Documentation**: `services/workflow-service/README-ReAct.md`
- **Project Summary**: `REFACTORING-SUMMARY.md`
- **Service Logs**: `docker compose logs [service-name]`

## Script Maintenance

### Adding New Scripts
1. Create both `.sh` and `.bat` versions for cross-platform compatibility
2. Make shell scripts executable: `chmod +x scripts/new-script.sh`
3. Update this README with script documentation
4. Test on both Linux/macOS and Windows

### Script Conventions
- Use descriptive names with hyphens
- Include help/usage information
- Provide clear success/failure indicators
- Use consistent output formatting with emojis for clarity
- Handle errors gracefully with appropriate exit codes

## ReAct Pattern Benefits

The ReAct pattern transforms traditional workflow execution by providing:

1. **Transparency**: Every decision is logged with explicit reasoning
2. **Adaptability**: Handles unexpected situations intelligently
3. **Intelligence**: Makes context-aware decisions with confidence levels
4. **Error Recovery**: Reasons about alternative approaches when actions fail
5. **Extensibility**: Easy to add new action types and reasoning strategies

This creates a more robust, transparent, and intelligent workflow execution system compared to traditional predefined workflows.
