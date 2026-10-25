# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run online:build

FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production ONLINE_HOST=0.0.0.0 ONLINE_PORT=8172
WORKDIR /app
# The bundled server's only external runtime import is ws. Copy its locked install,
# not the Capacitor SDK, TypeScript, Vite, npm cache, or other build tooling.
COPY --from=dependencies --chown=node:node /app/node_modules/ws ./node_modules/ws
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist/index.html ./dist/index.html
COPY --from=build --chown=node:node /app/dist-online/main.js ./dist-online/main.js
USER node
EXPOSE 8172
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "--input-type=module", "-e", "const r=await fetch('http://127.0.0.1:8172/health',{signal:AbortSignal.timeout(4000)});if(!r.ok)process.exit(1)"]
CMD ["node", "dist-online/main.js"]
