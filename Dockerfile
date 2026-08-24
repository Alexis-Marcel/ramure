# Image unique : application + serveur de synchronisation.
# Données persistées dans /data (à monter en volume).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /srv
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/index.mjs ./
COPY --from=build /app/dist ./public
ENV PORT=8484 DATA_DIR=/data STATIC_DIR=/srv/public
VOLUME /data
EXPOSE 8484
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8484/health || exit 1
CMD ["node", "index.mjs"]
