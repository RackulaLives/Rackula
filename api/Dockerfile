# Rackula API Sidecar
# Tiny Bun-based API for layout persistence
FROM oven/bun:1.1.45-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user with matching group
RUN addgroup --system --gid 1001 rackula && \
    adduser --system --uid 1001 --ingroup rackula rackula

# Copy dependencies, manifest, and source
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Create data directory
RUN mkdir -p /data && chown rackula:rackula /data

# OCI labels
LABEL org.opencontainers.image.source="https://github.com/RackulaLives/Rackula"
LABEL org.opencontainers.image.description="Rackula API Sidecar for persistent storage"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="Rackula API"

USER rackula

ENV NODE_ENV=production PORT=3001 DATA_DIR=/data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3001/health || exit 1

CMD ["bun", "src/index.ts"]
