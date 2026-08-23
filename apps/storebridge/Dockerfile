# Build context is the monorepo root, not this directory:
#   docker build -f apps/storebridge/Dockerfile .
# pnpm workspaces need the root manifest, pnpm-workspace.yaml, plus every
# workspace member's package.json present before `pnpm install
# --frozen-lockfile` can resolve the workspace tree.
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/storebridge/package.json ./apps/storebridge/package.json
# One line per packages/* workspace member — keep in sync with that
# directory so `pnpm install --frozen-lockfile` sees every manifest before
# the source copy below, without invalidating this layer's cache on every
# source-only change.
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/vitest-config/package.json ./packages/vitest-config/package.json

RUN pnpm install --frozen-lockfile --prod && pnpm store prune

COPY packages ./packages
COPY apps/storebridge ./apps/storebridge

RUN pnpm --filter storebridge run build

WORKDIR /app/apps/storebridge

CMD ["pnpm", "run", "docker-start"]
