FROM node:lts-alpine AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:lts-alpine AS production-stage
RUN npm install -g http-server
WORKDIR /app
COPY --from=build-stage /app/dist ./dist
EXPOSE 8080
CMD [ "http-server", "dist" ]