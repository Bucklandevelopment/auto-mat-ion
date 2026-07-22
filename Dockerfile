# ============================================================================
# auto-mat-ion Dockerfile
# Multi-stage build for the distributed testing framework
# ============================================================================

# ---------------------------------------------------------------------------
# Stage 1: builder -- install all deps and compile TypeScript
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Copy package manifests first for better layer caching
COPY package.json package-lock.json* ./

# Install ALL dependencies (including devDependencies for tsc)
# --ignore-scripts prevents the "prepare" hook from running before source is present
# --no-optional skips appium/webdriverio which are not needed in the container
RUN npm ci --ignore-scripts --no-optional

# Copy source and config needed for the build
COPY tsconfig.json ./
COPY src/ ./src/

# Install type stubs needed for compilation (webdriverio is optional at runtime
# but the TypeScript compiler requires its type declarations)
RUN npm install --no-save webdriverio 2>/dev/null || true

# Compile TypeScript -> dist/
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: runner -- lean production image
# ---------------------------------------------------------------------------
FROM node:20-slim AS runner

# Install curl for the health check and dumb-init for proper signal handling
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl dumb-init && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN groupadd --gid 1001 automation && \
    useradd --uid 1001 --gid automation --shell /bin/bash --create-home automation

WORKDIR /app

# Copy package manifests and install production-only dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-optional --ignore-scripts && \
    npm cache clean --force

# Copy compiled output from the builder stage
COPY --from=builder /app/dist ./dist

# Ensure the non-root user owns the workdir
RUN chown -R automation:automation /app

USER automation

# Default port defined in src/config/index.ts
EXPOSE 9090

# Health check against the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:9090/health || exit 1

ENV NODE_ENV=production

# Use dumb-init so SIGTERM/SIGINT are forwarded correctly to Node
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/index.js"]
