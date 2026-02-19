# Build stage
FROM node:22-alpine AS build
WORKDIR /app

# Build configuration
ARG VITE_ENV=production
ENV VITE_ENV=${VITE_ENV}

# Umami analytics configuration (passed as build args)
ARG VITE_UMAMI_ENABLED=false
ENV VITE_UMAMI_ENABLED=${VITE_UMAMI_ENABLED}
ARG VITE_UMAMI_WEBSITE_ID
ENV VITE_UMAMI_WEBSITE_ID=${VITE_UMAMI_WEBSITE_ID}
ARG VITE_UMAMI_SCRIPT_URL
ENV VITE_UMAMI_SCRIPT_URL=${VITE_UMAMI_SCRIPT_URL}

# Persistence feature flag (server-side storage)
ARG VITE_PERSIST_ENABLED=false
ENV VITE_PERSIST_ENABLED=${VITE_PERSIST_ENABLED}

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install -g npm@11
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Production stage - non-root nginx
FROM nginxinc/nginx-unprivileged:alpine

# OCI labels
LABEL org.opencontainers.image.source="https://github.com/RackulaLives/Rackula"
LABEL org.opencontainers.image.description="Rack Layout Designer for Homelabbers"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="Rackula"

# API proxy configuration
# API_HOST: Hostname or IP of the API server (default: rackula-api)
# API_PORT: Port the API listens on (default: 3001)
# API_WRITE_TOKEN: Optional bearer token injected for PUT/DELETE API requests (runtime env)
# RACKULA_AUTH_MODE: Auth mode toggle for app/API anonymous access gate (none|oidc|local)
# RACKULA_LISTEN_PORT: Port nginx listens on inside the container (default: 8080)
# NGINX_ENVSUBST_FILTER: Regex filter - only substitute these env vars, leave nginx vars ($host etc.) alone
ENV API_HOST=rackula-api
ENV API_PORT=3001
ENV RACKULA_AUTH_MODE=none
ENV RACKULA_LISTEN_PORT=8080
ENV NGINX_ENVSUBST_FILTER=^(API_HOST|API_PORT|API_WRITE_TOKEN|RACKULA_AUTH_MODE|AUTH_MODE|RACKULA_LISTEN_PORT)$

# Copy nginx config template (auto-processed by nginx's /docker-entrypoint.d/20-envsubst-on-templates.sh)
COPY ./deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
# Security headers snippet — shared between server block and /assets/ location
# (nginx drops server-level add_header when a location defines its own)
COPY ./deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
# Shared auth endpoint proxy settings
COPY ./deploy/nginx-auth-proxy.conf /etc/nginx/snippets/auth-proxy.conf
COPY --chmod=755 ./deploy/docker-entrypoint-wrapper.sh /usr/local/bin/docker-entrypoint-wrapper.sh
COPY --from=build /app/dist /usr/share/nginx/html

# Health check tracks runtime listen port; busybox wget is present in base image.
# EXPOSE remains 8080 as an advisory default for tooling/docs.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:${RACKULA_LISTEN_PORT:-8080}/health || exit 1

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/docker-entrypoint-wrapper.sh"]
CMD ["nginx", "-g", "daemon off;"]
