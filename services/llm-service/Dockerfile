# Multi-stage build for LLM Service with Whisper and Ollama support
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for build)
RUN npm install && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install system dependencies for Whisper and audio processing
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    curl \
    bash \
    git

# Install Whisper with CPU-only torch (lighter and more compatible)
RUN pip3 install --no-cache-dir --break-system-packages \
    torch torchaudio --index-url https://download.pytorch.org/whl/cpu && \
    pip3 install --no-cache-dir --break-system-packages openai-whisper

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Create necessary directories
RUN mkdir -p /app/models /app/uploads /app/output /app/logs /app/scripts && \
    chown -R nodejs:nodejs /app

# Copy package files and install production dependencies only
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
RUN npm install --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Create Ollama setup script
COPY --chown=nodejs:nodejs scripts/setup-ollama.sh ./scripts/setup-ollama.sh
RUN chmod +x ./scripts/setup-ollama.sh

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8005

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8005/health || exit 1

# Environment variables
ENV NODE_ENV=production
ENV PORT=8005
ENV WHISPER_MODELS_DIR=/app/models
ENV UPLOAD_DIR=/app/uploads
ENV OUTPUT_DIR=/app/output

# Start the application
CMD ["node", "dist/server.js"]
