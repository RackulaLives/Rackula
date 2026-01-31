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
# RACKULA_LISTEN_PORT: Port nginx listens on inside the container (default: 8080)
# NGINX_ENVSUBST_FILTER: Regex filter - only substitute these env vars, leave nginx vars ($host etc.) alone
ENV API_HOST=rackula-api
ENV API_PORT=3001
ENV RACKULA_LISTEN_PORT=8080
ENV NGINX_ENVSUBST_FILTER=^(API_HOST|API_PORT|RACKULA_LISTEN_PORT)$

# Copy nginx config template (auto-processed by nginx's /docker-entrypoint.d/20-envsubst-on-templates.sh)
COPY ./deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Health check (port 8080 for unprivileged nginx, busybox wget is built-in)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/health || exit 1

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
