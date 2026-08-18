FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json eslint.config.js ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip tini \
    && pip3 install --break-system-packages --no-cache-dir --pre "yt-dlp[default]" \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/src/index.js"]
