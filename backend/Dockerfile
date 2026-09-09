# One image, three services. Which one runs is decided by the SERVICE env var
# (see src/index.ts) — three near-identical Dockerfiles would drift.
FROM node:22-slim AS build

WORKDIR /app
# Corepack ships with Node and pins pnpm from package.json's packageManager
# field, so the image uses the same version as CI and developers.
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

FROM node:22-slim AS runtime

# Cloud Run gives no init process, so an unreaped child would leak. dumb-init
# also forwards SIGTERM, which is how Cloud Run asks for a graceful shutdown.
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
# --prod skips devDependencies; the compiled output in dist/ needs none of them.
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

COPY --from=build /app/dist ./dist

# Never run as root, even in a sandboxed container.
USER node

# Cloud Run injects PORT; this is only the local default.
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
