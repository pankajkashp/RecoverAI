# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install curl for container healthchecks
RUN apk add --no-cache libc6-compat curl

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY app/frontend/package.json ./app/frontend/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN npm ci

# Copy source files
COPY app/frontend ./app/frontend
COPY packages ./packages

# Set public build-time API URL
ARG NEXT_PUBLIC_API_URL=http://localhost:4001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN npm --workspace app/frontend run build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npm", "--workspace", "app/frontend", "run", "start"]
