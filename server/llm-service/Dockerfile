FROM node:24-alpine
# ENV NODE_ENV=production # just in case we wanna deploy
WORKDIR /llm
COPY package*.json ./
RUN npm install
# RUN npm ci --only = production # just in case we wanna deploy
COPY . .
# USER node # for security is good to run it as non-root
# RUN npm run build
CMD ["npm", "run", "dev"]


