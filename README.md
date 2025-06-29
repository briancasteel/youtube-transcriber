# YouTube Transcriber

A microservice-based YouTube video transcription application with external transcript service and AI text enhancement using Ollama, featuring a modern job-based workflow system.

## 🎯 Overview

This application transcribes YouTube videos to text using a modern microservice architecture with asynchronous job processing:

- **Frontend**: React web app with single-job workflow and real-time progress tracking
- **Backend**: Node.js microservices with TypeScript and gRPC communication
- **Transcript Service**: External transcript service (tactiq.io) + Ollama for text enhancement
- **Job Management**: Asynchronous processing with progress tracking and cancellation
- **Deployment**: Containerized for AWS deployment

## 🏗️ Architecture

```
Frontend (React) → API Gateway (gRPC Client) → Workflow Service (gRPC Server + JobManager)
                                                        ↓
                                                Mock YouTube Agent
                                                        ↓
                                          External Transcript Service + Ollama (Text Enhancement)
```

### Services

- **Frontend Service** (Port 3000): React web application with job-based workflow
- **API Gateway** (Port 8000): Express.js gateway with gRPC client integration
- **Workflow Service** (Port 8004): gRPC server with JobManager and asynchronous processing
- **Ollama** (Port 11434): Local LLM server for text enhancement and AI processing

## ✨ Key Features

### 🚀 Job-Based Workflow System
- **Single-Job Processing**: Simplified UI focused on one transcription at a time
- **Real-Time Progress**: Live progress updates from 0% to 100% with status messages
- **Cancellation Support**: Users can cancel jobs mid-processing with proper cleanup
- **No Timeouts**: Asynchronous processing prevents UI timeouts during long transcriptions

### 🔧 gRPC Communication
- **High Performance**: Binary protocol with HTTP/2 multiplexing
- **Type Safety**: Protocol buffer definitions ensure compile-time interface validation
- **Error Handling**: Automatic error mapping between gRPC and HTTP responses
- **Connection Management**: Efficient connection pooling and management

### 📊 Progress Tracking
- **Live Updates**: Real-time job status polling every 2 seconds
- **Detailed Status**: Progress percentage, start/end times, and current status
- **Error Recovery**: Comprehensive error handling with user-friendly messages
- **Result Retrieval**: Complete transcription data with captions, summary, and key points

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

### Job-Based Transcription API

```bash
# Start asynchronous transcription job
POST /api/transcription/jobs
{
  "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID"
}
# Response: {"success": true, "jobId": "job-1234567890-abc123"}

# Get job status and progress
GET /api/transcription/jobs/{jobId}
# Response: {
#   "success": true,
#   "data": {
#     "jobId": "job-1234567890-abc123",
#     "status": "processing",
#     "progress": 75,
#     "startTime": "2025-06-28T22:10:22.432Z",
#     "metadata": {"video_url": "https://www.youtube.com/watch?v=VIDEO_ID"}
#   }
# }

# Cancel running job
POST /api/transcription/jobs/{jobId}/cancel
# Response: {"success": true} or {"success": false, "error": "Job cannot be cancelled"}

# Get completed transcription result
GET /api/transcription/jobs/{jobId}/result
# Response: {
#   "success": true,
#   "data": {
#     "videoId": "VIDEO_ID",
#     "title": "Video Title",
#     "description": "Video description...",
#     "captions": [{"text": "Hello", "startTime": 0}, ...],
#     "summary": "Video summary...",
#     "keyPoints": ["point1", "point2", ...]
#   }
# }
```

### Legacy API (Still Supported)

```bash
# Start Langgraph-powered transcription
POST /api/workflow/youtube-transcription-langgraph
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

# Ollama
OLLAMA_MODELS=llama2:7b
```

### Model Configuration

The integrated workflow service uses:
- **External Transcript Service**: tactiq.io API for YouTube transcript retrieval
- **Ollama Model**: `llama2:7b` (lightweight for text enhancement and ReAct reasoning)
- **Mock Data Fallback**: Generates mock transcription when external service fails

To use different Ollama models, update the environment variables in `docker-compose.yml`.

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
