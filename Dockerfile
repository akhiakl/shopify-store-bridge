FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN pnpm install --frozen-lockfile --prod && pnpm store prune

COPY . .

RUN pnpm run build

CMD ["pnpm", "run", "docker-start"]
