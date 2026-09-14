FROM node:24.21.0-alpine AS builder
# The lockfile links ../../tooling/eslint-config; two levels above /app is the filesystem root,
# so npm cannot match that key and rejects the whole lockfile. Mirror the repo depth instead.
WORKDIR /repo/simulators/sensor-simulator
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.21.0-alpine AS production
# The lockfile links ../../tooling/eslint-config; two levels above /app is the filesystem root,
# so npm cannot match that key and rejects the whole lockfile. Mirror the repo depth instead.
WORKDIR /repo/simulators/sensor-simulator
# Patch base-image OS CVEs so the cd-registry Trivy scan (OS-scoped) stays green.
RUN apk upgrade --no-cache
COPY package*.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force
COPY --from=builder /repo/simulators/sensor-simulator/dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
