FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Install Prisma CLI in isolation (for migrate deploy at pre-deploy)
FROM base AS prisma-cli
WORKDIR /prisma-cli
RUN npm install prisma@6.19.2 --save-exact --no-save

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* is inlined at build time; Railway exposes service variables to
# Docker builds only through declared ARGs.
ARG NEXT_PUBLIC_UMAMI_SCRIPT_URL
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_UMAMI_DOMAINS
ENV NEXT_PUBLIC_UMAMI_SCRIPT_URL=$NEXT_PUBLIC_UMAMI_SCRIPT_URL \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID \
    NEXT_PUBLIC_UMAMI_DOMAINS=$NEXT_PUBLIC_UMAMI_DOMAINS
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone build output + static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy isolated Prisma CLI + migrations for preDeployCommand
COPY --from=prisma-cli --chown=nextjs:nodejs /prisma-cli/node_modules ./prisma-cli/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma/migrations ./prisma/migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma

USER nextjs

ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
