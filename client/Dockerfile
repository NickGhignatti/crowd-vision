FROM node:lts-alpine AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build

FROM node:lts-alpine AS production-stage
# apk upgrade patches base-image OS CVEs so the cd-registry Trivy scan (OS-scoped) stays green.
RUN apk upgrade --no-cache && npm install -g serve@14.2.6 && npm cache clean --force
WORKDIR /app
COPY package*.json ./
COPY --from=build-stage /app/dist ./dist
EXPOSE 8080
CMD [ "npm", "run", "start" ]