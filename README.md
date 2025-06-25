# YouTube Transcriber

A microservice-based YouTube video transcription application with local AI processing using Whisper and Ollama.

## 🎯 Overview

This application transcribes YouTube videos to text using a modern microservice architecture:

- **Frontend**: React web app with YouTube URL input and video display
- **Backend**: Node.js microservices with TypeScript
- **AI Processing**: Local Whisper + Ollama for transcription and text enhancement
- **Orchestration**: LangGraph for workflow management
- **Deployment**: Containerized for AWS deployment

## 🏗️ Architecture

```
Frontend (React) → API Gateway → Workflow Service (LangGraph)
                                      ↓
                    Video Processor ← → Transcription Service
                                      ↓
                    File Storage ← → LLM Service (Whisper + Ollama)
                                      ↓
                                   Redis Queue
```

### Services

- **Frontend Service** (Port 3000): React web application
- **API Gateway** (Port 8000): Request routing, rate limiting, authentication
- **Workflow Service** (Port 8001): LangGraph orchestration engine
- **Video Processor** (Port 8002): YouTube video processing with ytdl-core
- **Transcription Service** (Port 8003): Transcription coordination
- **LLM Service** (Port 8005): Local Whisper + Ollama processing
- **File Storage Service** (Port 8004): Temporary file management
- **Redis** (Port 6379): Message queue and caching

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
# Start the current services (Redis + API Gateway)
docker compose up --build

# Or run in background
docker compose up --build -d
```

This will:
- Start Redis message queue (port 6379)
- Start API Gateway (port 8000)
- Set up networking between services

### Access Points

- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:8000
- **Health Checks**: http://localhost:8000/health
- **API Documentation**: http://localhost:8000/api
- **Ollama**: http://localhost:11434
- **Redis**: localhost:6379

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
# Start specific service in development mode
cd services/api-gateway
npm run dev

# Run tests
npm test

# Build service
npm run build
```

### Hot Reload Development

Each service supports hot reload for rapid development:

```bash
# Frontend with Vite hot reload
cd services/frontend-service
npm run dev

# Backend services with nodemon
cd services/api-gateway
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Test specific service
cd services/api-gateway
npm test
```

### Debugging

```bash
# View all service logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f workflow-service
docker-compose logs -f llm-service

# Access Redis for state inspection
docker-compose exec redis redis-cli
```

## 📁 Project Structure

```
youtube-transcriber/
├── services/
│   ├── frontend-service/           # React Web App
│   ├── api-gateway/               # Request Routing & Rate Limiting
│   ├── workflow-service/          # LangGraph Orchestration
│   ├── video-processor-service/   # YouTube Processing
│   ├── transcription-service/     # Transcription Coordination
│   ├── llm-service/              # Whisper + Ollama
│   └── file-storage-service/     # File Management
├── shared/                       # Common Types & Utils
├── infrastructure/               # Deployment configs
├── docker-compose.yml           # Local development
└── README.md
```

## 🔧 Configuration

### Environment Variables

Each service can be configured via environment variables:

```bash
# API Gateway
PORT=8000
NODE_ENV=development
WORKFLOW_SERVICE_URL=http://workflow-service:8001
REDIS_URL=redis://redis:6379
LOG_LEVEL=debug

# LLM Service
OLLAMA_HOST=0.0.0.0
OLLAMA_PORT=11434
WHISPER_MODEL=base.en
```

### Model Configuration

The LLM service uses:
- **Whisper Model**: `base.en` (142MB, good balance of speed/accuracy)
- **Ollama Model**: `llama3.2:1b` (lightweight for text enhancement)

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
- Ensure ports 3000, 8000-8005, 6379, 11434 are available

**Transcription fails**:
- Check LLM service logs: `docker-compose logs llm-service`
- Verify Ollama models are downloaded
- Ensure sufficient memory for model loading

**Slow performance**:
- Increase Docker memory allocation
- Use smaller models for development
- Check system resource usage

### Getting Help

- Check service logs: `docker-compose logs -f [service-name]`
- View health status: http://localhost:8000/health/detailed
- Monitor Redis state: `docker-compose exec redis redis-cli`

For additional support, please open an issue in the repository.
