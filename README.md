# YouTube Transcriber

A microservice-based YouTube video transcription application with AI processing using external services and Ollama.

## 🎯 Overview

This application transcribes YouTube videos to text using a modern microservice architecture:

- **Frontend**: React web app with YouTube URL input and video display
- **Backend**: Node.js microservices with TypeScript
- **AI Processing**: Local Whisper + Ollama for transcription and text enhancement
- **Orchestration**: LangGraph for workflow management
- **Deployment**: Containerized for AWS deployment

## 🏗️ Architecture

```
Frontend (React) → Express Gateway → Workflow Service (ReAct Engine)
                                           ↓
                                    Integrated Media Processor
                                           ↓
                                    Whisper + Ollama (Local AI)
```

### Services

- **Frontend Service** (Port 3000): React web application
- **Express Gateway** (Port 8000): Industry-standard API gateway with routing, rate limiting, CORS
- **Workflow Service** (Port 8004): Integrated ReAct workflow engine with media processing
- **Ollama** (Port 11434): Local LLM server for text enhancement and AI processing

## 🚀 Quick Start

### Prerequisites

- **Docker Desktop** with at least 6GB memory allocation
- **System Requirements**:
  - RAM: 8GB minimum, 16GB recommended
  - CPU: 4 cores minimum, 8 cores recommended
  - Storage: 20GB free space
  - GPU: Optional but improves Ollama performance

### Setup Instructions

#### Step 1: Prerequisites
1. **Install Docker Desktop**
   - Download from: https://www.docker.com/products/docker-desktop/
   - Ensure Docker Desktop is running (check system tray)
   - Allocate at least 6GB memory to Docker in settings

2. **Install Node.js** (for local development)
   - Download from: https://nodejs.org/ (LTS version)

#### Step 2: Test Your Setup
```bash
# On Windows, run the test script
scripts\test-setup.bat

# On Mac/Linux, run:
# bash scripts/test-setup.sh
```

This will verify:
- Docker is running
- Dependencies can be installed
- Services can be built

#### Step 3: Start the Services
```bash
# Start all services
docker compose up --build

# Or run in background
docker compose up --build -d
```

This will:
- Start Express Gateway (port 8000)
- Start Workflow Service (port 8004)
- Start Ollama LLM server (port 11434)
- Start Frontend (port 3000)
- Set up networking between services

### Access Points

- **Frontend**: http://localhost:3000
- **Express Gateway**: http://localhost:8000
- **Health Checks**: http://localhost:8000/health
- **Workflow Service**: http://localhost:8004 (internal)
- **Ollama**: http://localhost:11434

## 📊 API Endpoints

### Transcription API

```bash
# Start Langgraph-powered transcription (Recommended)
POST /api/workflow/youtube-transcription-langgraph
{
  "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "options": {
    "language": "en",
    "enhanceText": true,
    "generateSummary": true,
    "extractKeywords": true,
    "quality": "highestaudio",
    "format": "mp3"
  }
}

# Start transcription (Legacy)
POST /api/transcribe
{
  "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "options": {
    "language": "en",
    "enhanceText": true,
    "generateSummary": true,
    "extractKeywords": true
  }
}

# Get workflow execution status
GET /api/workflow/execution/{executionId}

# Cancel workflow execution
POST /api/workflow/execution/{executionId}/cancel

# Get video info
GET /api/video-info?url=https://www.youtube.com/watch?v=VIDEO_ID
```

### Health Checks

```bash
# API Gateway health
GET /health

# Detailed system health
GET /health/detailed
```

## 🛠️ Development

### Individual Service Development

```bash
# Start workflow service in development mode
cd services/workflow-service
npm run dev

# Run tests
npm test

# Build service
npm run build
```

### Hot Reload Development

Services support hot reload for rapid development:

```bash
# Frontend with Vite hot reload
cd frontend
npm run dev

# Workflow service with nodemon
cd services/workflow-service
npm run dev
```

### Testing

```bash
# Test workflow service
cd services/workflow-service
npm test

# Run ReAct workflow tests
npm run test:react

# Test specific functionality
npm run test:watch
```

### Debugging

```bash
# View all service logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api-gateway
docker-compose logs -f workflow-service
docker-compose logs -f ollama

# Test Express Gateway configuration
docker-compose logs -f api-gateway
```

## 📁 Project Structure

```
youtube-transcriber/
├── frontend/                     # React Web App
├── gateway/                      # Express Gateway Configuration
│   ├── config/                   # Gateway configuration files
│   ├── Dockerfile               # Gateway container
│   └── README.md                # Gateway documentation
├── services/
│   └── workflow-service/        # Integrated ReAct Workflow Engine
├── shared/                      # Common Types & Utils
├── scripts/                     # Development & Testing Scripts
├── memory-bank/                 # Architecture & Implementation Docs
├── docker-compose.yml          # Local development
└── README.md
```

## 🔧 Configuration

### Environment Variables

Each service can be configured via environment variables:

```bash
# Express Gateway
NODE_ENV=development
LOG_LEVEL=info

# Workflow Service
NODE_ENV=development
PORT=8004
OLLAMA_URL=http://ollama:11434
OLLAMA_DEFAULT_MODEL=llama2:7b
LOG_LEVEL=debug
DOWNLOAD_DIR=/app/downloads
OUTPUT_DIR=/app/output
WHISPER_MODELS_DIR=/app/models

# Ollama
OLLAMA_MODELS=llama2:7b
```

### Model Configuration

The integrated workflow service uses:
- **Whisper Model**: Local Whisper implementation for transcription
- **Ollama Model**: `llama2:7b` (lightweight for text enhancement and ReAct reasoning)

To use different models, update the environment variables in `docker-compose.yml`.

## 🎯 Usage Example

1. **Start the system**: `docker-compose up`
2. **Open frontend**: Navigate to http://localhost:3000
3. **Enter YouTube URL**: Paste a YouTube video URL
4. **Start transcription**: Click the transcribe button
5. **Monitor progress**: Watch real-time status updates
6. **View results**: See transcription, summary, and keywords

## 📈 Performance

### Expected Performance (Local Development)

- **Startup Time**: 2-3 minutes (first time with model downloads)
- **Subsequent Starts**: ~30 seconds
- **5-minute Video**: 3-5 minutes processing time
- **Memory Usage**: 6-8GB total across all services

### Optimization Tips

- Allocate more memory to Docker Desktop (8GB+)
- Use SSD storage for better I/O performance
- Enable GPU acceleration for Ollama if available
- Use smaller models for faster processing during development

## 🔒 Security Features

- Rate limiting on all API endpoints
- Input validation and sanitization
- CORS configuration
- Helmet security headers
- Container security with non-root users
- Temporary file cleanup
- Request ID tracking for audit trails

## 🚢 Production Deployment

The application is designed for AWS deployment:

- **Container Orchestration**: ECS or EKS
- **Load Balancing**: Application Load Balancer
- **Storage**: S3 for file storage
- **Caching**: ElastiCache Redis
- **Monitoring**: CloudWatch logs and metrics

See `infrastructure/` directory for deployment configurations.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Services won't start**:
- Check Docker Desktop memory allocation (needs 6GB+)
- Ensure ports 3000, 8000, 8004, 11434 are available
- Verify Express Gateway configuration is valid

**Transcription fails**:
- Check workflow service logs: `docker-compose logs workflow-service`
- Check Ollama service logs: `docker-compose logs ollama`
- Verify Ollama models are downloaded
- Ensure sufficient memory for model loading

**Gateway issues**:
- Check Express Gateway logs: `docker-compose logs api-gateway`
- Verify gateway configuration files in `gateway/config/`
- Test direct workflow service access: http://localhost:8004/health

**Slow performance**:
- Increase Docker memory allocation
- Use smaller models for development
- Check system resource usage

### Getting Help

- Check service logs: `docker-compose logs -f [service-name]`
- View health status: http://localhost:8000/health
- Test Express Gateway: `curl http://localhost:8000/health`
- Test workflow service: `curl http://localhost:8004/health`

For additional support, please open an issue in the repository.
