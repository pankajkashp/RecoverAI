# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install native build tools & curl for healthchecks
RUN apk add --no-cache libc6-compat openssl curl

# Copy root workspace and package manifests
COPY package.json package-lock.json ./
COPY app/backend/package.json ./app/backend/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/
COPY integrations/package.json ./integrations/

# Install workspace dependencies
RUN npm ci

# Copy Prisma schema and generate client
COPY database/prisma/schema.prisma ./database/prisma/
RUN npx prisma generate --schema=database/prisma/schema.prisma

# Copy source code across workspaces
COPY app/backend ./app/backend
COPY packages ./packages
COPY integrations ./integrations
COPY database ./database

# Build shared packages and backend
RUN npm --workspace app/backend run build

EXPOSE 4000

ENV NODE_ENV=development
ENV BACKEND_PORT=4000

# Deploy schema to local database on boot and start backend server
CMD ["sh", "-c", "npx prisma db push --schema=database/prisma/schema.prisma && npx tsx app/backend/src/server.ts"]
