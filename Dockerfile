# ==========================================================
# Stage 1: Build & Dependencies
# ==========================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install native build tools needed for better-sqlite3 compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests first for caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies needed for Vite build)
RUN npm ci

# Copy application source code
COPY . .

# Build the Vite React frontend into /app/dist
RUN npm run build

# Remove development dependencies to keep image lean
RUN npm prune --omit=dev

# ==========================================================
# Stage 2: Production Runtime
# ==========================================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Runtime certificate bundle for HTTPS providers
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create directories for persistent data and ensure permissions for node user
RUN mkdir -p /var/data /app/data && chown -R node:node /var/data /app

# Copy production node_modules from builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Copy compiled frontend dist from builder
COPY --from=builder --chown=node:node /app/dist ./dist

# Copy backend server code and configuration
COPY --from=builder --chown=node:node /app/server ./server
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Set environment defaults for Render / Docker
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=10000
ENV SPICECOAST_DB_PATH=/var/data/spicecoast.sqlite

USER node

EXPOSE 10000

# Health check using built-in Node fetch
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 10000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server/server.js"]
