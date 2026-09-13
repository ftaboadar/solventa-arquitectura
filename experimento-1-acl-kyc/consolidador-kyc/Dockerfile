FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV CONSOLIDADOR_PORT=7000
EXPOSE 7000

CMD ["node", "src/worker.js"]
