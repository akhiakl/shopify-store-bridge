# Build context is the monorepo root, not this directory:
#   docker build -f apps/storebridge/Dockerfile .
# npm workspaces need the root manifest plus every workspace member's
# package.json present before `npm ci` can resolve the workspace tree.
FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* turbo.json ./
COPY packages ./packages
COPY apps/storebridge/package.json ./apps/storebridge/package.json

RUN npm ci --omit=dev && npm cache clean --force

COPY packages ./packages
COPY apps/storebridge ./apps/storebridge

RUN npm run build --workspace=storebridge

WORKDIR /app/apps/storebridge

CMD ["npm", "run", "docker-start"]
