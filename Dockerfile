# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    TZ=Asia/Shanghai

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS migrator
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
CMD ["npx", "prisma", "migrate", "deploy"]

FROM dependencies AS builder
ARG NEXT_PUBLIC_WEB_PUSH_VAPID_KEY=""
ENV NODE_ENV=production \
    NEXT_PHASE=phase-production-build \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    NEXT_PUBLIC_WEB_PUSH_VAPID_KEY=${NEXT_PUBLIC_WEB_PUSH_VAPID_KEY}
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=1536

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tini tzdata fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npx playwright install --with-deps chromium \
    && npm cache clean --force

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/scripts/production-scheduler.mjs ./scripts/production-scheduler.mjs
COPY --from=builder /app/scripts/verify-container-runtime.mjs ./scripts/verify-container-runtime.mjs

ARG APP_VERSION=0.0.0-rc
ARG GIT_SHA=unbuilt
ARG BUILD_DATE=unbuilt
ENV APP_VERSION=${APP_VERSION} GIT_SHA=${GIT_SHA} BUILD_DATE=${BUILD_DATE}

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app nextjs \
    && mkdir -p /app/.data/assets /app/.data/mobile-assets \
    && chown -R nextjs:nodejs /app/.data

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:3000/api/health/ready >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
