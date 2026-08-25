FROM node:lts-alpine AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL
ARG VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
RUN npm run build

FROM nginx:alpine AS production-stage
# Static files need a static server: nginx:alpine is ~64MB against node:lts-alpine's
# ~167MB, and starts in milliseconds instead of booting Node to run `serve`.
# apk upgrade patches base-image OS CVEs so the cd-registry Trivy scan stays green.
RUN apk upgrade --no-cache
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build-stage /app/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
