# Simple Express-based API Gateway

This directory contains a simple Express-based API Gateway that replaces the custom API Gateway service.

## Overview

This is a lightweight API gateway built with Express.js and http-proxy-middleware that provides:

- Request routing and proxying
- Rate limiting
- CORS handling
- Security headers (Helmet)
- Request/response logging
- Request ID tracking
- Error handling

## Implementation Files

### `src/server.js`
Main gateway server implementing:
- Express.js application setup
- Middleware configuration (CORS, Helmet, compression, etc.)
- Rate limiting for different endpoint types
- Proxy configuration to workflow service
- Health check endpoints
- Error handling and graceful shutdown

### `package.json`
Dependencies and scripts for the gateway service

### `Dockerfile`
Container configuration for deployment

## API Endpoints

The gateway exposes the following endpoints:

- `/health*` - Health check endpoints
- `/api/transcribe*` - Transcription API endpoints
- `/api/workflow*` - Workflow management endpoints
- `/api/video*` - Video processing endpoints
- `/api/video-info*` - Video information endpoints
- `/` - Root endpoint with service information

## Policies Applied

### All Endpoints
- **CORS**: Cross-origin resource sharing with frontend origins
- **Headers**: Request ID forwarding and security headers
- **Proxy**: Request forwarding to workflow-service

### Rate Limited Endpoints
- **Transcription API**: 100 requests per 15 minutes
- **Workflow API**: 50 requests per 15 minutes
- **Video API**: 30 requests per 15 minutes

### Additional Policies
- **Request Size Limit**: 10MB maximum request size
- **Logging**: Request/response logging for debugging

## Service Endpoints

- **workflow-service**: `http://workflow-service:8004`

## Docker Configuration

The gateway runs in a Docker container:
- **Port**: 8080 (mapped to host port 8000)
- **Health Check**: `/health` endpoint monitoring
- **Dependencies**: workflow-service

## Migration from Custom Gateway

This Express Gateway configuration replaces the previous custom API gateway with equivalent functionality:

### Maintained Features
- ✅ Request routing to workflow service
- ✅ CORS configuration for frontend
- ✅ Rate limiting with same limits
- ✅ Request size limits (10MB)
- ✅ Health check endpoints
- ✅ Request ID tracking
- ✅ Error handling and logging

### Benefits of Migration
- **Industry Standard**: Well-maintained, enterprise-grade solution
- **Configuration-Driven**: YAML-based configuration vs custom code
- **Built-in Features**: Comprehensive policy ecosystem
- **Better Performance**: Optimized for high-throughput scenarios
- **Reduced Maintenance**: Less custom code to maintain
- **Extensibility**: Plugin ecosystem for additional features

## Development

### Local Development
```bash
cd gateway
npm install
npm run dev
```

### Docker Development
```bash
docker-compose up api-gateway
```

## Troubleshooting

### Common Issues

1. **Configuration Errors**: Check YAML syntax in config files
2. **Service Connection**: Ensure workflow-service is running and accessible
3. **Port Conflicts**: Verify port 8000 is available on host
4. **Health Check Failures**: Check if `/health` endpoint is responding

### Logs
Gateway logs are available through Docker:
```bash
docker-compose logs api-gateway
```

## Future Enhancements

Potential improvements that can be easily added:

- **Authentication**: JWT or OAuth2 policies
- **API Keys**: Application-based access control
- **Monitoring**: Metrics collection and dashboards
- **Caching**: Response caching for improved performance
- **Load Balancing**: Multiple backend service instances
- **Circuit Breaker**: Fault tolerance patterns
