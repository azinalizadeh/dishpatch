# syntax=docker/dockerfile:1
# Multi-stage build → distroless nonroot runtime (07-security.md › Containers). Images pinned by digest.

FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS base
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

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:55de7e48a8414e7aff825207c0b3c0f7db3b10133efc50d748560c27c9053be1 AS runtime
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
