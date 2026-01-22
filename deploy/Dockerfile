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

# Copy nginx config and built assets
COPY ./deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Health check (port 8080 for unprivileged nginx, busybox wget is built-in)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/health || exit 1

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
