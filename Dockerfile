# RedSky production image (Railway builds this file). Multi-stage: dependencies → build → minimal runtime.
ARG NODE_VERSION=22.22.0

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Produces .next/standalone (the server) and dist/migrate.mjs (the bundled migration runner).
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 redsky && useradd --system --uid 1001 --gid redsky --no-create-home redsky
COPY --from=build --chown=redsky:redsky /app/.next/standalone ./
COPY --from=build --chown=redsky:redsky /app/.next/static ./.next/static
COPY --from=build --chown=redsky:redsky /app/public ./public
COPY --from=build --chown=redsky:redsky /app/dist ./dist
COPY --from=build --chown=redsky:redsky /app/drizzle ./drizzle
USER redsky
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
