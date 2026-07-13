# The Quality Market — production image.
# Runs the custom Node server (server.js: Next.js + Socket.IO) so realtime
# features (chat, live delivery tracking, dispatch board) work fully.
# Works as-is on Railway, Render, Fly.io, or any Docker host.
#
#   docker build -t quality-market .
#   docker run --env-file .env -p 3000:3000 quality-market
#
# NEXT_PUBLIC_* variables are inlined at BUILD time — pass them as build args
# (hosts like Railway/Render do this automatically from the environment).

# Node >= 22.7 required: server.js uses ESM syntax without "type": "module",
# which relies on Node's module-syntax auto-detection.
FROM node:22-alpine AS base
WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CURRENCY_SYMBOL=RWF
ARG NEXT_PUBLIC_SOCKET_ENABLED=true
# Browser Maps key — next.config.mjs inlines it into the client bundle at build
# time, so it must be present here, not just at runtime.
ARG PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CURRENCY_SYMBOL=$NEXT_PUBLIC_CURRENCY_SYMBOL \
    NEXT_PUBLIC_SOCKET_ENABLED=$NEXT_PUBLIC_SOCKET_ENABLED \
    PUBLIC_GOOGLE_MAPS_API_KEY=$PUBLIC_GOOGLE_MAPS_API_KEY \
    # Dummy DB URL so `prisma generate`/module import don't complain at build;
    # the real DATABASE_URL is provided at runtime.
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    DIRECT_URL=postgresql://build:build@localhost:5432/build \
    NODE_ENV=production
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
# Non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/lib ./lib
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/instrumentation.js ./instrumentation.js

USER app
EXPOSE 3000
ENV PORT=3000

# Apply pending migrations, then start Next.js + Socket.IO.
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
