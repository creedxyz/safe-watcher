# --------------------------------------------------
# 1) Build Stage: install dependencies & build
# --------------------------------------------------
FROM node:20 AS builder

# Install yq for YAML processing
RUN apt-get update && apt-get install -y wget && \
    wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/bin/yq && \
    chmod +x /usr/bin/yq

# Create app directory
WORKDIR /app

# Copy package definition & install
COPY package*.json ./
RUN npm install

# Copy configuration files and prepare script
COPY config.yaml* stack.env* ./
COPY scripts/prepare-config.sh ./scripts/
RUN chmod +x ./scripts/prepare-config.sh

# Run configuration preparation
RUN ./scripts/prepare-config.sh

# Copy source code & build
COPY . .
RUN npm run build

# --------------------------------------------------
# 2) Final Stage: distroless Node.js runtime
# --------------------------------------------------
FROM gcr.io/distroless/nodejs22-debian12

# Set working directory & non-root user
WORKDIR /app
USER 1000:1000

ENV NODE_ENV=production

# Copy configuration and built files
COPY --from=builder /app/stack.env /app/
COPY --from=builder /app/dist /app

# This is your app's start command
CMD ["/app/index.mjs"]

