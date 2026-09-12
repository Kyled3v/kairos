# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .

# ── Development (tsx, no compile step) ───────────────────────────────────
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npx", "tsx", "src/server.ts"]

# ── Production ────────────────────────────────────────────────────────────
FROM base AS prod
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx", "tsx", "src/server.ts"]
