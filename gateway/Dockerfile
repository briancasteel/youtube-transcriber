FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY gateway/package*.json ./

# Install dependencies
RUN npm install && npm cache clean --force

# Copy proto files (will be provided by build context)
COPY shared/proto/ ./proto/

# Copy source code
COPY gateway/src/ ./src/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S gateway -u 1001 -G nodejs

# Change ownership
RUN chown -R gateway:nodejs /app

# Switch to non-root user
USER gateway

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start the gateway
CMD ["node", "src/server.js"]
