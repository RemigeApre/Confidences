FROM node:20-alpine

RUN apk add --no-cache p7zip

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
