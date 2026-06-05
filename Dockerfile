FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npm run prisma:generate
RUN npm prune --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
