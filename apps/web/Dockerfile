# Build do front (@bolao/web) — SPA Vite/React servido por nginx.
# IMPORTANTE: build context = RAIZ do monorepo (precisa do pnpm-lock.yaml e do
# packages/shared). No Coolify: Base Directory = /  e
# Dockerfile Location = apps/web/Dockerfile

# ---- builder ----
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# As vars VITE_* são build-time (Vite "assa" elas no bundle), então precisam
# estar presentes ANTES do `vite build`. O Coolify injeta as env vars como
# build args — declare aqui as que o front consome.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# manifests primeiro (cache de layer enquanto o lockfile não muda)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# código-fonte
COPY packages/shared packages/shared
COPY apps/web apps/web

# shared antes (o build do web roda `tsc -b` que pode referenciar o projeto)
RUN pnpm --filter @bolao/shared build \
 && pnpm --filter @bolao/web build

# ---- runtime: nginx servindo o estático ----
FROM nginx:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
