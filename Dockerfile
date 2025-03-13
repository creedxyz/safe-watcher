# --------------------------------------------------
# 1) Build Stage: install dependencies & build
# --------------------------------------------------
FROM node:20 AS builder

# Create app directory
WORKDIR /app

# Copy package definition & install
COPY package*.json ./
RUN npm install

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

# (Optional) Build ARG for labeling
ARG PACKAGE_VERSION
LABEL org.opencontainers.image.version="${PACKAGE_VERSION}"

# Copy built files from builder stage
COPY --from=builder /app/dist /app

# This is your app’s start command
CMD ["/app/index.mjs"]