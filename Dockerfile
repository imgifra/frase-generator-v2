FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npx playwright install chromium

COPY . .

CMD ["node", "scripts/server.js"]