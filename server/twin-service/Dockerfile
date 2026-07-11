# Build context is the repo root (see docker-compose.yml / just/k8s.just) —
# twin-service reads the shared Cedar bundle at server/auth-policy AND the
# role-weight ladder at server/auth-policy/../auth-contracts/roles.json (both
# siblings of twin-service, not inside auth-policy), via relative paths from
# its own dist/. Only resolves correctly if the built tree mirrors the repo's
# real nesting. COPY paths and WORKDIR below preserve that nesting instead of
# flattening twin-service to /app.
FROM node:26-alpine AS builder
WORKDIR /app/server/twin-service
COPY server/auth-policy /app/server/auth-policy
COPY server/auth-contracts /app/server/auth-contracts
COPY server/twin-service/package*.json ./
# @crowdvision/eslint-config is a lint-only dep that resolves via file:../../tooling/eslint-config,
# a path that does not exist inside this Docker build context. Strip it and the stale lock file
# before installing so npm does not fail with EMISSINGTARGET.
RUN node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));delete (p.devDependencies||{})['@crowdvision/eslint-config'];fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && rm -f package-lock.json \
    && npm install
COPY server/twin-service .
RUN npm run build

FROM node:26-alpine AS production
WORKDIR /app/server/twin-service
# Patch base-image OS CVEs so the cd-registry Trivy scan (OS-scoped) stays green.
RUN apk upgrade --no-cache
COPY server/auth-policy /app/server/auth-policy
COPY server/auth-contracts /app/server/auth-contracts
COPY server/twin-service/package*.json ./
RUN node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));delete (p.devDependencies||{})['@crowdvision/eslint-config'];fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && rm -f package-lock.json \
    && npm install --omit=dev \
    && npm cache clean --force
COPY --from=builder /app/server/twin-service/dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
