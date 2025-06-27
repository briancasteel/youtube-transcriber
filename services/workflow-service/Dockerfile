# Use Node.js 18 Alpine as base image
FROM node:current-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY services/workflow-service/package*.json ./
COPY services/workflow-service/tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install && npm cache clean --force

# Copy proto files (will be provided by build context)
COPY shared/proto/ ./proto/

# Copy source code
COPY services/workflow-service/src/ ./src/

# Build the application
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S workflow -u 1001 -G nodejs

# Change ownership of the app directory
RUN chown -R workflow:nodejs /app

# Switch to non-root user
USER workflow

# Expose ports
EXPOSE 8004
EXPOSE 50051
EXPOSE 9229

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8004/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
