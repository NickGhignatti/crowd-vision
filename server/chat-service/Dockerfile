FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));delete (p.devDependencies||{})['@crowdvision/eslint-config'];fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && rm -f package-lock.json \
    && npm install
COPY . .
RUN npm run build

FROM node:26-alpine AS production
WORKDIR /app
RUN apk upgrade --no-cache
COPY package*.json ./
RUN node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));delete (p.devDependencies||{})['@crowdvision/eslint-config'];fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && rm -f package-lock.json \
    && npm install --omit=dev \
    && npm cache clean --force
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
