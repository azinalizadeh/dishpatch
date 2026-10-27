# syntax=docker/dockerfile:1
# Multi-stage build → distroless nonroot runtime (07-security.md › Containers). Images pinned by digest.

FROM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/

# Build the SPA with the full dev toolchain.
FROM base AS build
RUN pnpm install --frozen-lockfile --filter @dishpatch/web...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @dishpatch/web build

# Production dependencies for the API (and the shared package it imports) only.
FROM base AS deps
RUN pnpm install --frozen-lockfile --prod --filter @dishpatch/api...

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:cb606325b7ec4af55462cb0b424a53b452a5b4a894ffe841fcf1048d216fb9f8 AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=deps /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src packages/shared/src
COPY apps/api/package.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations
COPY --from=build /app/apps/web/dist apps/web/dist
USER nonroot
EXPOSE 3000
# Node 24 runs the TypeScript sources directly (type stripping); there is no separate API build step.
CMD ["apps/api/src/server.ts"]
