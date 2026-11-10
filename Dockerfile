FROM node:22-alpine
# System Chromium for the browser engine (Puppeteer's own download is skipped).
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    DATA_DIR=/app/data \
    OUT_DIR=/app/out
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY bin ./bin
COPY src ./src
COPY examples ./examples
VOLUME ["/app/data", "/app/out"]
ENTRYPOINT ["node", "bin/review-extractor.js"]
CMD ["--help"]
