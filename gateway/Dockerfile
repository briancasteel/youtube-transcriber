FROM node:18-alpine

# Set working directory
WORKDIR /var/lib/eg

# Install Express Gateway globally
RUN npm install -g express-gateway@1.16.11

# Copy configuration files
COPY config/ ./config/

# Create necessary directories
RUN mkdir -p logs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start Express Gateway
CMD ["eg", "start"]
