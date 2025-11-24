FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm install --production
# Copy the compiled JS and assets from the dist folder
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["npm", "start"]