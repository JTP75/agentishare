# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/hub-server/package.json ./packages/hub-server/

RUN npm ci --workspace=packages/hub-server --include-workspace-root

COPY packages/hub-server/tsconfig.json ./packages/hub-server/
COPY packages/hub-server/src ./packages/hub-server/src
COPY config ./config

RUN npm run build -w packages/hub-server

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/hub-server/package.json ./packages/hub-server/

RUN npm ci --workspace=packages/hub-server --include-workspace-root --omit=dev

COPY --from=builder /app/packages/hub-server/dist ./packages/hub-server/dist
COPY --from=builder /app/config ./config

EXPOSE 8080

CMD ["node", "packages/hub-server/dist/index.js"]
