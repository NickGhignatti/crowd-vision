FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
# @crowdvision/eslint-config is a lint-only dep that resolves via file:../../tooling/eslint-config,
# a path that does not exist inside this Docker build context. Strip it and the stale lock file
# before installing so npm does not fail with EMISSINGTARGET.
RUN node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));delete (p.devDependencies||{})['@crowdvision/eslint-config'];fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && rm -f package-lock.json \
    && npm install
COPY . .
RUN npm run build

FROM node:24-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));delete (p.devDependencies||{})['@crowdvision/eslint-config'];fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && rm -f package-lock.json \
    && npm install --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
