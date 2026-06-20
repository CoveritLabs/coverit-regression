# Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
# Proprietary and confidential. Unauthorized use is strictly prohibited.
# See LICENSE file in the project root for full license information.

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm pkg delete "devDependencies.@coveritlabs/git-hooks" \
  && npm install --no-save --package-lock=false --ignore-scripts \
    typescript@6.0.3 \
    tsc-alias@1.8.17 \
    @types/ejs@3.1.5 \
    @types/js-yaml@4.0.9 \
    @types/node@25.9.3 \
    @types/pg@8.20.0

COPY tsconfig.json ./
COPY src ./src
RUN npm run build:generator

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache ca-certificates git

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY templates ./templates
COPY config.yaml ./

RUN mkdir -p input logs output tmp \
  && chown -R node:node /app

USER node

CMD ["node", "dist/worker.js"]
